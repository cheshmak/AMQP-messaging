'use strict';
const
  Q = require('q'),
  async = require('async'),
  system = require('./system'),
  _ = require('lodash'),
  pushProvider = require('./push'),
  assertQueue = require('./assertQueue'),
  BSON = require('bson');

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

service.prototype.isConnectionAvailable = function () {
  if (system.connection) {
    return true;
  }
  return false;
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

  const channelWrapper = system.connection.createChannel({
    setup: function (channel) {
      return assertQueue.workerQueue(channel, routeName);
    }
  });

  channelWrapper.addSetup((ch) => {
    self._addChannel(routeName, ch);
    ch.prefetch(_.get(options, 'prefetchCount', 1));
    ch.consume(routeName, function (msg) {
      var parsed;

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
        var replyTo = _.get(msg, 'properties.replyTo', false),
          response;

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
  /*
   return Q(connection.createChannel().then(function (ch) {
   return ch.assertQueue(routeName, {
   durable: true
   }).then(function () {
   ch.prefetch(_.get(options, 'prefetchCount', 1));
   }).then(function () {

   });
   }));*/
};

service.prototype.cancelWorker = function (routeName) {
  const self = this;

  const defer = Q.defer();

  const channels = self._getChannels(routeName);

  const cancelConsumers = (ch, callback) => {
    const consumerTags = _.keys(ch.consumers);

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
        callback(err, res);
      });
    }
  };

  async.parallel(_.map(channels, (ch) => (callback) => {
    cancelConsumers(ch, callback);
  }), (err, res) => {
    if (err) {
      console.log(`messaging:worker for queue: ${routeName} can not canceled by error.`);
      defer.reject(err);
    } else {
      console.log(`messaging:worker for queue: ${routeName} canceled.`);
      defer.resolve(res);
    }
  });

  return defer.promise;
};

// var pushProviders = {};

/**
 * @returns: promise of push provider: resolves: pushProvider
 */
service.prototype.getPushProvider = function (routeName) {
  /*  if (_.has(pushProviders, routeName)) {
   return _.get(pushProviders, routeName);
   }
   var push = new pushProvider(routeName, connection);
   _.set(pushProviders, routeName, push);
   return push;*/
  // Due to amqp-connection-manager bug we create it each time, but it SHOULD be fixed
  return new pushProvider(routeName, system.connection);
};

module.exports = service;
