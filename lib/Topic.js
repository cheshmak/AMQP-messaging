'use strict';

const
  Q = require('q'),
  _ = require('lodash'),
  uuidv4 = require('uuid/v4'),
  BSON = require('bson'),
  system = require('./System');

const
  _bson = Symbol('bson'),
  _exchanges = Symbol('exchanges'),
  _channels = Symbol('channels');

/**
 * @return {QPromise} with an object of Topic as first params
 */
class Topic {
  constructor() {
    this[_bson] = new BSON();
    this[_exchanges] = {};
    this[_channels] = [];
  }

  assertConnection() {
    if (!system.connection) {
      return system.assertConnection()
        .then(() => {
          return Q.resolve(system.connection);
        });
    }
    return Q.resolve(system.connection);
  }

  get bson() {
    return this[_bson];
  }

  get exchanges() {
    this[_exchanges];
  }

  set exchanges(exObj) {
    this[_exchanges][exObj.name] = exObj.value;
  }

  publish(exName, content, queueName) {
    return this.assertConnection()
      .then((con) => {
        const channelWrapper = con.createChannel({
          setup: (ch) => {
            return ch.assertExchange(exName, '', {
              durable: false
            });
          }
        });
        return channelWrapper.publish(exName, _.defaultTo(queueName, ''), new Buffer(this.bson.serialize(content)));
        // return Q.resolve();
      });
  }

  subscribe(exName, workerFunc) {
    return this.assertConnection()
      .then((con) => {
        const queueId = uuidv4();
        const channelWrapper = con.createChannel({
          setup: (ch) => {
            const ex = ch.assertExchange(exName, 'fanout', {
                durable: false
              }),
              queue = ch.assertQueue(queueId, {
                durable: true
              });

            return Q.all([ex, queue]);
          }
        });
        channelWrapper.addSetup((ch) => {
          ch.bindQueue(queueId, exName, '');
          ch.consume(queueId, (msg) => {
            let parsed = null;

            try {
              parsed = this.bson.deserialize(msg.content, {
                promoteBuffers: true
              });
            } catch (e) {
              console.log('messaging:error parsing input queue', {
                exchangeName: exName,
                error: e,
                incomingmsg: msg
              });
            }

            if (parsed) {
              if (_.isFunction(workerFunc)) {
                workerFunc(parsed);
              }
            } else {
              ch.ack(msg);
            }
          }, {
            noAck: false
          });
        });
        return Q.resolve(channelWrapper);
      });
  }
}

module.exports = new Topic();
