'use strict';
const
  _ = require('lodash'),
  config = require('./config'),
  assertQueue = require('./assertQueue'),
  logger = require('ches-logger'),
  BSON = require('bson');

function generateUuid() {
  return Math.random().toString() +
    Math.random().toString() +
    Math.random().toString();
}

class Push {
  constructor(routeName, connection, service) {
    this.routeName = routeName;
    this.connection = connection;
    this.service = service;
    this.timeToLive = _.get(config[routeName], 'timeToLive');
    return Promise.resolve(this);
  }

  async sendPush(data) {
    const bson = new BSON();
    await this.service.getChannelWrapper();
    const channel = this.service.getChannel();
    await assertQueue.workerQueue(channel, this.routeName, this.service);
    await channel.sendToQueue(this.routeName, bson.serialize(data));
    return true;
  }

  rpcCall(data) {
    const self = this;
    return new Promise(async (orgResolve, orgReject) => {
      let timeout;
      let isClosed = false;
      let isSent = false;

      const resolve = (data) => {
        if (!isClosed) {
          isClosed = true;
        }
        orgResolve(data);
      };

      const reject = (err) => {
        if (!isClosed) {
          isClosed = true;
        }
        orgReject(err);
      };

      const correlationId = generateUuid();

      await self.service.getChannelWrapper();
      const channel = self.service.getChannel();

      await assertQueue.workerQueue(channel, self.routeName, self.service);
      const replyQueue = await assertQueue.replyQueue(channel, self.routeName, self.service);
      const replyName = replyQueue.queue;

      const bson = new BSON();

      channel.consume(replyName, async (msg) => {
        const corrId = _.get(msg, 'properties.correlationId', false);
        if (corrId !== correlationId) {
          channel.nack(msg);
          return true;
        }

        if (timeout) {
          clearTimeout(timeout);
        }
        channel.ack(msg);
        let parsed;

        try {
          parsed = bson.deserialize(msg.content, {
            promoteBuffers: true
          });
        } catch (e) {
          logger.log('error', 'messaging:error parsing rpc call response', {
            routeName: replyName,
            error: e,
            incomingmsg: msg
          });
        }

        if (_.get(parsed, 'success')) {
          resolve(_.get(parsed, 'result'));
        } else if (_.get(parsed, 'invalid')) {
          reject('timeout');
        } else {
          reject(_.get(parsed, 'result'));
        }

        channel.cancel(replyName);
      }, {
        consumerTag: replyName
      });

      if (isSent) {
        return true;
      }

      await channel.sendToQueue(self.routeName, bson.serialize(data), {
        correlationId: correlationId,
        replyTo: replyName
      });
      isSent = true; // it ensures that messages is sent only once if amqp connection restarted

      if (self.timeToLive > 0) {
        timeout = setTimeout(async () => {
          logger.log('error', 'Timeout had happened and replied queue has been closed', {
            replyName: replyName
          });

          try {
            await channel.sendToQueue(
              replyName,
              bson.serialize({
                invalid: true
              }), {
                correlationId: correlationId
              }
            );
          } catch (e) {
            logger.log('error', 'delete queue error', {
              err: e
            });
            reject('timeout');
          }
        }, self.timeToLive);
      }
    });
  }
}

module.exports = Push;
