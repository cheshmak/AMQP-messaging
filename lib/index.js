'use strict';
const channelManager = require('./channelManager');
const assertQueue = require('./assertQueue');
const _ = require('lodash');
const uuidv4 = require('uuid/v4');
const logger = require('ches-logger');
const EventEmitter = require('events');
const queueConfig = require('./config').queue;
const notepack = require('notepack.io');
const replyListeners = {};
const zlib = require('zlib');

class Messaging {
  constructor() {}

  static async serializeJsonObject(object) {
    return new Promise((resolve, reject) => {
      zlib.gzip(notepack.encode(object),(error, result) => {
        if(error) {
          return reject(error); 
        }
        return resolve(result);
      });
    });
  }
  static deserializeBufferToJsonObject(buffer) {
    return notepack.decode(zlib.gunzipSync(buffer));
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
   * }
   * @returns {Promise<void>}
   */
  async addWorker(queueName, workerFunction, options) {
    const channel = await channelManager.getChannel();
    await assertQueue.workerQueue(channel, queueName, options);

    channel.prefetch(_.get(options, 'prefetchCount', 1));
    channel.consume(queueName, async (msg) => {
      let parsed;
      try {
        parsed = Messaging.deserializeBufferToJsonObject(msg.content);
      } catch (e) {
        logger.log('error', 'messaging:error parsing input queue', {
          routeName: queueName,
          error: e,
          incomingmsg: msg
        });
      }

      if (!parsed) {
        channel.ack(msg); // don't call workerFunction  but call ack for next incomming data
        return true;
      }

      let response;

      try {
        const result = await workerFunction(parsed);
        response = {
          success: true,
          result
        };
      } catch (result) {
        logger.log('error', 'error in service ', {
          routeName: queueName,
          incommingData: msg.content.toString(),
          result
        });

        response = {
          success: false,
          result
        };
      }

      const replyTo = _.get(msg, 'properties.replyTo', false);
      if (replyTo) {
        await channel.sendToQueue(replyTo, await Messaging.serializeJsonObject(response), {
          correlationId: msg.properties.correlationId
        });
      }

      channel.ack(msg);
    });

    logger.log('verbose', `messaging:worker for queue: ${queueName} added, waiting for incoming queue`);
  }

  async cancelWorkers() {
    const channel = await channelManager.getChannel();
    const consumers = _.keys(channel.consumers);

    for (const routeName of consumers) {
      await channel.cancel(routeName);
      logger.log('verbose', `messaging:worker for queue: ${routeName} canceled.`);
    }
  }


  async sendPush(queueName, data, options = {}) {
    const channel = await channelManager.getChannel();
    let persistant;
    if (_.isUndefined(options.persistent)) {
      persistant = true;
    } else {
      persistant = options.persistent;
    }

    await channel.sendToQueue(queueName, await Messaging.serializeJsonObject(data), {
      persistent: persistant
    });
    return this;
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
  async rpcCall(queueName, data, options) {
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

        const callback = (content) => {
          if (timeout) {
            clearTimeout(timeout);
          }
          let parsed;
          try {
            parsed = Messaging.deserializeBufferToJsonObject(content);
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
        await channel.sendToQueue(queueName, await Messaging.serializeJsonObject(data), {
          correlationId: correlationId,
          replyTo: replyName
        });
        const timeToLive = _.get(options, 'ttl') || _.get(queueConfig[queueName], 'timeToLive');
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
    await channel.publish(queueName, '', await Messaging.serializeJsonObject(data));
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
        logger.log('debug', `A message received to ${queueName} exchange.`, [_.get(msg, 'content', {})]);
        parsed = Messaging.deserializeBufferToJsonObject(msg.content);
      } catch (e) {
        logger.log('error', 'messaging:error parsing input queue', {
          exchangeName: queueName,
          error: e,
          incomingmsg: msg
        });
      }

      if (!parsed) {
        await channel.ack(msg);
        return true;
      }

      if (_.isFunction(workerFunc)) {
        try {
          workerFunc(parsed);
        } catch (err) {
          logger.log('error', `Worker for queue ${queue.queue} in ${queueName} exchange did not call correctly`, {
            reason: 'Invalid callback for subscriber',
            err
          });
        }
      }
    }, {
      noAck: false
    });
  }
}


// backward compatibility:
// deprecated
Messaging.service = class {
  constructor() {
    return Promise.resolve(this);
  }
  getPushProvider(queueName) {
    const messaging = new Messaging();
    return Promise.resolve({
      sendPush: _.partial(messaging.sendPush, queueName),
      rpcCall: _.partial(messaging.rpcCall, queueName)
    });
  }
  addWorker() {
    const messaging = new Messaging();
    return messaging.addWorker(...arguments);
  }
  cancelWorker() {
    const messaging = new Messaging();
    return messaging.cancelWorkers();
  }
};
Messaging.topic = class {
  static subscribe() {
    const messaging = new Messaging();
    return messaging.subscribe(...arguments);
  }
  static publish() {
    const messaging = new Messaging();
    return messaging.publish(...arguments);
  }
};


module.exports = Messaging;
