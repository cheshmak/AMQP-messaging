'use strict';

const
  Q = require('q'),
  _ = require('lodash'),
  logger = require('ches-logger'),
  BSON = require('bson'),
  system = require('./system');

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
    const defer = Q.defer();
    if (_.isNil(exName) || _.isEmpty(exName) || _.isNil(content)) {
      return Q.reject('Missing value for mandatory fields');
    }
    system.assertConnection()
      .then((con) => {
        const channelWrapper = con.createChannel({
          setup: (ch) => {
            return Q(ch.assertExchange(exName, 'fanout', {
              durable: false
            }));
          }
        });
        channelWrapper.addSetup((ch) => {
          Q.fcall(() => {
            return ch.publish(exName, '', this.bson.serialize(content));
          }).then(() => {
            logger.log('verbose', `A message published to ${exName} exchange.`);
            channelWrapper.close();
            defer.resolve(ch);
          }).catch((err) => {
            defer.reject(err);
          });
        });
      });
    return defer.promise;
  }

  subscribe(exName, workerFunc) {
    const defer = Q.defer();
    if (_.isNil(exName) || _.isEmpty(exName)) {
      return Q.reject('Missing value for mandatory fields');
    }
    return system.assertConnection()
      .then((con) => {
        const channelWrapper = con.createChannel({
          setup: (ch) => {
            return Q(ch.assertExchange(exName, 'fanout', {
              durable: false
            }));
          }
        });
        channelWrapper.addSetup((ch) => {
          Q.fcall(() => {
            this.exchanges = exName;
            return ch.assertQueue('', {
              exclusive: true
            });
          }).then((q) => {
            ch.bindQueue(q.queue, exName, '');
            ch.consume(q.queue, (msg) => {
              let parsed = null;
              try {
                logger.log('verbose', `A message received to ${exName} exchange.`);
                parsed = this.bson.deserialize(msg.content, {
                  promoteBuffers: true
                });
              } catch (e) {
                logger.log('error', 'messaging:error parsing input queue', {
                  exchangeName: exName,
                  error: e,
                  incomingmsg: msg
                });
              }

              if (parsed) {
                if (_.isFunction(workerFunc)) {
                  try {
                    workerFunc(parsed);
                  } catch (err) {
                    logger.log('error', `Worker for queue ${q.queue} in ${exName} exchange did not call correctly`);
                  }
                }
              } else {
                ch.ack(msg);
              }
            }, {
              noAck: false
            });
            defer.resolve(ch);
          });
        });
        return defer.promise;
      });
  }
}

module.exports = new Topic();
