'use strict';
const
  _ = require('lodash'),
  config = require('./config'),
  assertQueue = require('./assertQueue'),
  logger = require('ches-logger'),
  uuidv4 = require('uuid/v4'),
  BSON = require('bson');

class Push {
  constructor(routeName, connection, service) {
    Object.assign(this, {
      routeName,
      connection,
      service
    });
    this.timeToLive = _.get(config[routeName], 'timeToLive');
    return Promise.resolve(this);
  }

  async sendPush(data) {
    const bson = new BSON();
    await this.service.getChannelWrapper();
    const channel = this.service.getChannel();
    await assertQueue.workerQueue(channel, this.routeName, this.service);
    await new Promise((resolve, reject) => {
      channel.sendToQueue(this.routeName, bson.serialize(data), {}, (error) => {
        if (error) {
          return reject(error);
        }
        resolve();
      });
    });
    return this;
  }

  rpcCall(data) {
    return new Promise(async (resolve, reject) => {
      let timeout;

      const correlationId = uuidv4();
      const channelWrapper = await this.service.getChannelWrapper();
      channelWrapper.addSetup(async (channel) => {
        await assertQueue.workerQueue(channel, this.routeName, this.service);
        const replyQueue = await assertQueue.replyQueue(channel, this.routeName, this.service);
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

        await channel.sendToQueue(this.routeName, bson.serialize(data), {
          correlationId: correlationId,
          replyTo: replyName
        });

        if (this.timeToLive > 0) {
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
          }, this.timeToLive);
        }
      });
    });
  }
}

module.exports = Push;
