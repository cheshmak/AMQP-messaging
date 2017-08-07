'use strict';
const
  logger = require('ches-logger'),
  Q = require('q'),
  async = require('async'),
  system = require('./system'),
  _ = require('lodash'),
  pushProvider = require('./push'),
  assertQueue = require('./assertQueue'),
  BSON = require('bson');

const
  _assertedQueues = Symbol('assertedQueues'),
  _confirmChannel = Symbol('confirmChannel'),
  _channelWrapper = Symbol('channelWrapper'),
  _createNewChannel = Symbol('createNewChannel');

/**
 * resolves service
 * @this service
 * @prefetchCount: int: count of messages send before calling any ack
 */
function service() {
  const self = this;

  if (!system.connection) {
    return system.assertConnection(() => self._purgeChannels())
      .then(() => {
        return Q.resolve(self);
      });
  }
  return Q.resolve(self);
}

service.prototype.channels = {};
service[_channelWrapper] = null;
service[_confirmChannel] = null;
service[_assertedQueues] = {};
service._queueNames = [];

service[_createNewChannel] = function () {
  service[_channelWrapper] = system.connection.createChannel({
    setup: (channel) => {
      logger.log('debug', 'A new channel is going to create...');
      return Q.fcall(() => {
        if (service[_confirmChannel]) {
          return service[_confirmChannel].close();
        }
        return Q.resolve();
      }).catch((e) => {
        logger.log('error', 'Old channel can not close', {
          err: e
        });
      }).then(() => {
        channel.on('close', () => {
          service[_confirmChannel] = null;
          _.each(service[_assertedQueues], (value, key) => {
            service[_assertedQueues][key] = false;
          });
          logger.log('verbose', 'Old channel is closed');
        });
        service[_confirmChannel] = channel;
        logger.log('verbose', 'A new channel has been created');
        return Q.resolve();
      });
    }
  });
};

service.isQueueAsserted = function (queue) {
  if (_.has(service[_assertedQueues], queue)) {
    return service[_assertedQueues][queue];
  }
  return false;
};

service.setQueueAsserted = function (queue) {
  service[_assertedQueues][queue] = true;
};

service.getChannelWrapper = function () {
  if (!service[_channelWrapper]) {
    service[_createNewChannel]();
  }
  return service[_channelWrapper].waitForConnect().then(() => {
    return service[_channelWrapper];
  });
};

service.getChannel = function () {
  return service[_confirmChannel];
};

service.prototype._addChannel = function (routeName, channel) {
  const self = this;

  if (!_.has(self.channels, routeName) || !_.isArray(self.channels[routeName])) {
    self.channels[routeName] = [];
  }
  self.channels[routeName].push(channel);
};

service.prototype._getChannels = function (routeName) {
  const self = this;

  if (!_.has(self.channels, routeName) || !_.isArray(self.channels[routeName])) {
    return [];
  }
  return self.channels[routeName];
};

service.prototype._purgeChannels = function () {
  const self = this;

  const kys = _.keysIn(self.channels);

  _.each(kys, (k) => {
    self.channels[k] = [];
  });
};

/**
 * it adds a worker to queue
 * when a route comes for @routeName it calls @workerFunction
 * @routeName: route name
 * @workerFunction{PROMISE}: function: parameters: JSON parsed received, returns promise
 * @options:{
 *    prefetchCount:how many rabbitmq messages will be sent to this worker before ack called? default is 1
 * }
 *
 */
service.prototype.addWorker = function (routeName, workerFunction, options) {
  const self = this;
  service.getChannelWrapper().then((chw) => {
    assertQueue.workerQueue(service.getChannel(), routeName, service).then(() => {
      chw.addSetup((ch) => {
        self._addChannel(routeName, ch);
        ch.prefetch(_.get(options, 'prefetchCount', 1));
        ch.consume(routeName, function (msg) {
          let parsed;

          try {
            const bson = new BSON();

            parsed = bson.deserialize(msg.content, {
              promoteBuffers: true
            });
          } catch (e) {
            console.log('messaging:error parsing input queue', {
              routeName: routeName,
              error: e,
              incomingmsg: msg
            });
          }
          if (parsed) {
            const replyTo = _.get(msg, 'properties.replyTo', false);
            let response;

            Q.fcall(function () {
              return workerFunction(parsed);
            }).then((result) => {
              // check if this is an RPC call
              response = {
                result: result,
                success: true
              };
            }).catch(function (result) {
              console.log('error', 'error in service ', {
                routeName: routeName,
                incommingData: msg.content.toString(),
                result: result
              });
              response = {
                success: false,
                result: result
              };

              return true;
            }).done(function () {
              if (replyTo) {
                const bson = new BSON();

                Q.fcall(() => {
                  return ch.sendToQueue(
                    replyTo,
                    bson.serialize(response), {
                      correlationId: msg.properties.correlationId
                    }
                  );
                }).catch(() => {
                  console.log('replyTo queue has been removed');
                });
              }
              // send ack
              // console.log('messaging:worker done for ' + routeName);
              try {
                ch.ack(msg);
              } catch (e) {
                console.log(e);
              }
            });
          } else {
            ch.ack(msg); // don't call workerFunction  but call ack for next incomming data
          }
        }, {
          noAck: false
        });
        console.log(`messaging:worker for queue: ${routeName} added, waiting for incoming queue`);
      });
    });
  });
};

service.prototype.cancelWorker = function (routeName) {
  const cancelConsumers = (ch) => {
    const consumerTags = _.keys(ch.consumers);
    const cancelAll = Q.defer();

    if (_.size(consumerTags) > 0) {
      async.parallel(_.map(consumerTags, (ct) => (iCb) => {
        ch.cancel(ct)
          .then(() => {
            iCb(null, null);
          })
          .catch((err) => {
            iCb(err, null);
          });
      }), (err, res) => {
        if (err) {
          console.log(`messaging:worker for queue: ${routeName} can not canceled by error.`);
          cancelAll.reject(err);
        } else {
          console.log(`messaging:worker for queue: ${routeName} canceled.`);
          cancelAll.resolve(res);
        }
      });
    }
    return cancelAll.promise;
  };

  return cancelConsumers(service.getChannel());
};

/**
 * @returns: promise of push provider: resolves: pushProvider
 */
service.prototype.getPushProvider = function (routeName) {
  // Due to amqp-connection-manager bug we create it each time, but it SHOULD be fixed
  return new pushProvider(routeName, system.connection, service);
};

module.exports = service;
