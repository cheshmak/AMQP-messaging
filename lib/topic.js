'use strict';

const
  _ = require('lodash'),
  Logger = require('ches-logger'),
  BSON = require('bson'),
  System = require('./system');

const
  _bson = Symbol('bson'),
  _exchanges = Symbol('exchanges'),
  _channels = Symbol('channels');

class Topic {
  constructor() {
    this[_bson] = new BSON();
    this[_exchanges] = [];
    this[_channels] = [];
  }

  get bson() {
    return this[_bson];
  }

  get exchanges() {
    return this[_exchanges];
  }

  set exchanges(exName) {
    if (_.indexOf(this.exchanges, exName) !== -1) {
      this[_exchanges].push(exName);
    }
  }

  publish(exName, content) {
    if (_.isNil(exName) || _.isEmpty(exName) || _.isNil(content)) {
      return Promise.reject(new Error('Missing value for mandatory fields'));
    }

    return new Promise(async (resolve, reject) => {
      const connection = await System.assertConnection();
      connection.createChannel({
        setup: async (channel) => {
          await channel.assertExchange(exName, 'fanout', {
            durable: false
          });
          try {
            await channel.publish(exName, '', this.bson.serialize(content));
            channel.close();
            Logger.log('verbose', `A message published to ${exName} exchange.`, {
              content
            });
          } catch (e) {
            return reject(e);
          }
          resolve(channel);
        }
      });
    });
  }

  subscribe(exName, workerFunc) {
    if (_.isNil(exName) || _.isEmpty(exName)) {
      return Promise.reject('Missing value for mandatory fields');
    }

    return new Promise(async (resolve) => {
      const connection = await System.assertConnection();
      connection.createChannel({
        setup: async (channel) => {
          channel.assertExchange(exName, 'fanout', {
            durable: false
          });
          this.exchanges = exName;
          const queue = await channel.assertQueue('', {
            exclusive: true
          });

          channel.bindQueue(queue.queue, exName, '');
          channel.consume(queue.queue, async (msg) => {
            let parsed = null;
            try {
              Logger.log('verbose', `A message received to ${exName} exchange.`, [_.get(msg, 'content', {})]);
              parsed = this.bson.deserialize(msg.content, {
                promoteBuffers: true
              });
            } catch (e) {
              Logger.log('error', 'messaging:error parsing input queue', {
                exchangeName: exName,
                error: e,
                incomingmsg: msg
              });
            }

            if (!parsed) {
              channel.ack(msg);
              return true;
            }

            if (_.isFunction(workerFunc)) {
              try {
                workerFunc(parsed);
              } catch (err) {
                Logger.log('error', `Worker for queue ${queue.queue} in ${exName} exchange did not call correctly`, {
                  reason: 'Invalid callback for subscriber',
                  err
                });
              }
            }
          }, {
            noAck: false
          });
          resolve(channel);
        }
      });
    });
  }
}

module.exports = new Topic();
