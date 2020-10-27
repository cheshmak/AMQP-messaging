'use strict';
const channelManager = require('./channelManager'),
  assertQueue = require('./assertQueue'),
  _ = require('lodash'),
  uuidv4 = require('uuid/v4'),
  logger = require('./logger'),
  EventEmitter = require('events'),
  Serializer = require('./serializer'),
  utils = require('./utils'),
  packQManager = require('./packQueueManager'),
  replyListeners = {};

class Messaging {
  static setLogger(loggerFunc) {
    logger.setLogger(loggerFunc);
  }
  /**
   * set callback for rabbitmq connection problem
   * @param callback
   */
  setOnError(callback) {
    channelManager.setOnError(callback);
  }

  /**
   * ensure connection is secure, for example for services that do important jobs
   * we can not start connection on sendPush, we should ensure connection at the startup of the service
   */
  async ensureConnection() {
    await channelManager.getChannel();
  }

  /**
   *
   * @param queueName
   * @param workerFunction
   * @param options: {
   *   prefetchCount
   *   ttl: in ms
   *   noAck: boolean, default false, noAck:true is recommended for high load rpc calls
   * }
   * @returns {Promise<void>}
   */
  async addWorker(queueName, workerFunction, options) {
    const channel = await channelManager.getChannel();
    await assertQueue.workerQueue(channel, queueName, options);
    const noAck = !!_.get(options, 'noAck');
    channel.prefetch(_.get(options, 'prefetchCount', 1));
    channel.consume(queueName, async (msg) => {
      let parsed;
      try {
        parsed = await Serializer.deserializeBufferToJsonObject(msg.content);
      } catch (e) {
        logger.log('error', 'messaging:error parsing input queue', {
          routeName: queueName,
          error: e,
          incomingmsg: msg
        });
      }

      if (!parsed) {
        if (!noAck) {
          channel.ack(msg); // don't call workerFunction  but call ack for next incomming data
        }
        return true;
      }

      let response;
      const replyTo = _.get(msg, 'properties.replyTo', false);
      try {
        if (parsed.p) { // p -> isPacked
          const promiseArray = [];
          for (let i = 0; i < parsed.d.length; i++) {
            try {
              promiseArray.push(workerFunction(parsed.d[i])); // d -> data
            } catch (e) {
              logger.log('error','error in worker function which was not in promise!!', {
                err: e
              });
            }
          }
          await utils.promiseAllSettled(promiseArray);
        } else {
          const result = await workerFunction(parsed.d); // d -> data
          response = {
            success: true,
            result
          };
        }
      } catch (result) {
        if (!replyTo) { // if it's a rpc call caller is responsible for the any error
          logger.log('error', 'error in service ', {
            routeName: queueName,
            incommingData: msg.content.toString(),
            result
          });
        }
        response = {
          success: false,
          result
        };
      }


      if (replyTo) {
        await channel.sendToQueue(replyTo, await Serializer.serializeJsonObject(response), { // We don't pack it as we're sending it to rpcCall consume function
          correlationId: msg.properties.correlationId
        });
      }
      if (!noAck) {
        channel.ack(msg);
      }
    }, {
      noAck
    });

    logger.log('verbose', `messaging:worker for queue: ${queueName} added, waiting for incoming queue`);
  }

  async cancelWorkers() {
    const channel = await channelManager.getChannel();
    const consumers = _.keys(channel.consumers);

    await packQManager.clearAllQueues();
    for (const routeName of consumers) {
      await channel.cancel(routeName);
      logger.log('verbose', `messaging:worker for queue: ${routeName} canceled.`);
    }
  }

  async sendPush(queueName, data, options) {
    if (_.get(options, 'pack.size', 1) > 1) {
      return await packQManager.addItemToQueue(queueName, data, {
        queueSize: _.get(options, 'pack.size', 1),
        interval: _.get(options, 'pack.interval', 10000)
      });
    }
    const serializedData = await Serializer.serializeJsonObject({
      p: false,
      d: data
    });
    const channel = await channelManager.getChannel();
    return await channel.sendToQueue(queueName, serializedData, {
      persistent: true
    });
  }

  /**
   *
   * @param queueName
   * @param data
   * @param options: {
   *   ttl: in ms
   * }
   * @returns {Promise<*>}
   */
  rpcCall(queueName, data, options) {
    return new Promise(async (resolve, reject) => {
      try {
        let timeout;
        const correlationId = uuidv4();
        const channel = await channelManager.getChannel();
        const replyName = await assertQueue.replyQueue(channel, queueName, options);

        // create listener if doesn't exist
        if (!replyListeners[queueName]) {
          replyListeners[queueName] = new EventEmitter();
          channel.consume(replyName,
            (msg) => replyListeners[queueName].emit(msg.properties.correlationId, msg.content), {
              noAck: true
            });
        }
        const callback = async (content) => {
          if (timeout) {
            clearTimeout(timeout);
          }
          let parsed;
          try {
            parsed = await Serializer.deserializeBufferToJsonObject(content);
          } catch (e) {
            logger.log('error', 'messaging:error parsing rpc call response', {
              routeName: replyName,
              error: e,
              incomingmsg: content
            });
          }

          if (_.get(parsed, 'success')) {
            resolve(_.get(parsed, 'result'));
          } else {
            reject(_.get(parsed, 'result'));
          }
        };
        replyListeners[queueName].once(correlationId, callback);
        await channel.sendToQueue(queueName, await Serializer.serializeJsonObject({
          p: false, // pack
          d: data // data
        }), {
          correlationId: correlationId,
          replyTo: replyName
        });
        const timeToLive = _.get(options, 'ttl');
        if (timeToLive > 0) {
          timeout = setTimeout(async () => {
            logger.log('error', 'timeout happened', {
              replyName: replyName
            });
            replyListeners[queueName].removeListener(correlationId, callback);
            reject('timeout');
          }, timeToLive);
        }
      } catch (err) {
        logger.log('error', 'something tribble happened in messaging', {
          err
        });
        reject(err);
      }
    });
  }


  async publish(queueName, data) {
    if (_.isNil(queueName) || _.isEmpty(queueName) || _.isNil(data)) {
      throw new Error('Missing value for required fields');
    }
    const channel = await channelManager.getChannel();
    await channel.assertExchange(queueName, 'fanout', {
      durable: false
    });

    await channel.publish(queueName, '', await Serializer.serializeJsonObject(data));
    logger.log('debug', `A message published to ${queueName} exchange.`, {
      content: data
    });
    return channel;
  }

  async subscribe(queueName, workerFunc) {
    if (_.isNil(queueName) || _.isEmpty(queueName)) {
      throw new Error('Missing value for mandatory fields');
    }
    const channel = await channelManager.getChannel();
    await channel.assertExchange(queueName, 'fanout', {
      durable: false
    });
    const queue = await channel.assertQueue('', {
      exclusive: true
    });

    await channel.bindQueue(queue.queue, queueName, '');
    await channel.consume(queue.queue, async (msg) => {
      let parsed = null;
      try {
        parsed = await Serializer.deserializeBufferToJsonObject(msg.content);
      } catch (e) {
        logger.log('error', 'messaging:error parsing input queue', {
          exchangeName: queueName,
          error: e,
          incomingmsg: msg
        });
      }

      if (parsed && _.isFunction(workerFunc)) {
        try {
          await workerFunc(parsed);
        } catch (err) {
          logger.log('error', `Worker for queue ${queue.queue} in ${queueName} exchange did not call correctly`, {
            reason: 'Invalid callback for subscriber',
            err
          });
        }
      }
      await channel.ack(msg);
    }, {
      noAck: false
    });
  }
}
module.exports = Messaging;
