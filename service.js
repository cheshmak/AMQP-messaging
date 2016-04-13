'use strict';
var devMode = (process.env.NODE_ENV !== 'production'),
  Q = require('q'),
  amqplib = require('amqplib'),
  _ = require('lodash'),
  pushProvider = require('./push'),
  logger = require('ches-logger'),
  errors = require('common-errors');

if (!devMode) {
  if (_(process.env.AMQP_SERVER_ADDRESS).isNil()) {
    throw new errors.ArgumentNullError('AMQP_SERVER_ADDRESS');
  }
}

//the connection variable is used locally and used many times
//it is set in service function if existing connection not available
var connection;
/**
 * resolves service
 * @prefetchCount: int: count of messages send before calling any ack
 */
var service = function () {
  var scope = this;
  if (!connection) {
    return this.connect()
      .then(function () {
        return Q.resolve(scope);
      });
  }
  return Q.resolve(this);
};

service.prototype.connect = function () {
  return Q(amqplib.connect('amqp://' + (devMode ? 'localhost' : process.env.AMQP_SERVER_ADDRESS)))
    .then(function (con) {
      connection = con;
      return connection;
    })
    .catch(function (err) {
      logger.error('cant connect to rabbitmq', err);
      return Q.reject(err);
    });
};

service.prototype.isConnectionAvailable = function () {
  if (connection) {
    return true;
  }
  return false;
};



/**
 * it adds a worker to queue
 * when a route comes for @routeName it calls @workerFunction
 * @routeName: route name
 * @workerFunction{PROMISE}: function: parameters: JSON parsed received, returns promise
 * @prefetchCount: how many rabbitmq messages will be sent to this worker before ack called? default is 1
 *
 */
service.prototype.addWorker = function (routeName, workerFunction, prefetchCount) {
  return Q(connection.createChannel().then(function (ch) {
    return ch.assertQueue(routeName, {
      durable: true
    }).then(function () {
      ch.prefetch(prefetchCount || 1);
    }).then(function () {
      ch.consume(routeName, function (data) {
        var parsed;
        try {
          parsed = JSON.parse(data.content.toString());
        } catch (e) {
          logger.error('messaging:error parsing input queue', {
            routeName: routeName,
            error: e,
            incomingdata: data
          });
        }
        if (parsed) {
          Q.fcall(function () {
            return workerFunction(parsed);
          }).catch(function (err) {
            logger.log('error', 'error in service ', {
              routeName: routeName,
              incommingData: data.content.toString(),
              error: err
            });
            return true;
          }).done(function () {
            //send ack
            // logger.trace('messaging:worker done for ' + routeName);
            try {
              ch.ack(data);
            } catch (e) {
              console.log(e);
            }
          });
        } else {
          ch.ack(data); //don't call workerFunction  but call ack for next incomming data
        }
      }, {
        noAck: false
      });
      logger.trace('messaging:worker for queue :' + routeName + ' added, waiting for incoming queue');
    });
  }));
};

/**
 * @returns: promise of push provider: resolves: pushProvider
 */
service.prototype.getPushProvider = function (routeName) {
  if (_.has(this.pushProviders, routeName)) {
    return _.get(this.pushProviders, routeName);
  }
  var push = new pushProvider(routeName, connection);
  _.set(this.pushProviders, routeName, push);
  return push;
};

module.exports = service;
