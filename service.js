'use strict';
var devMode = (process.env.NODE_ENV !== 'production'),
  Q = require('q'),
  amqplib = require('amqp-connection-manager'),
  _ = require('lodash'),
  pushProvider = require('./push'),
  Exception = require('ches-exception');

if (!devMode) {
  if (!_(process.env.AMQP_SERVER_ADDRESS).isString()) {
    throw new Exception('NOT_FOUND', new Error('AMQP_SERVER_ADDRESS'));
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
  connection = amqplib.connect('amqp://' + (devMode ? 'localhost' : process.env.AMQP_SERVER_ADDRESS));
  connection.on('disconnect', () => {
    console.error('FATAL:: amqp is disconnected, trying to reconnect');
  });
  connection.on('connect', () => {
    console.log('success connect to amqp');
  });
  return Q.resolve(connection);
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
 * @options:{
 *    prefetchCount:how many rabbitmq messages will be sent to this worker before ack called? default is 1
 * }
 *
 */
service.prototype.addWorker = function (routeName, workerFunction, options) {

  var channelWrapper = connection.createChannel({
    setup: function (channel) {
      return channel.assertQueue(routeName, {
        durable: true
      });
    }
  });
  channelWrapper.addSetup((ch) => {
    ch.prefetch(_.get(options, 'prefetchCount', 1));
    ch.consume(routeName, function (msg) {
      var parsed;
      try {
        parsed = JSON.parse(msg.content.toString());
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
          })
          .then((result) => {
            //check if this is an RPC call
            response = {
              result: result,
              success: true
            };
          }).catch(function (err) {
            console.log('error', 'error in service ', {
              routeName: routeName,
              incommingData: msg.content.toString(),
              error: err
            });
            response = {
              success: false,
              error: err + ''
            };
            return true;
          }).done(function () {
            if (replyTo) {
              Q(ch.sendToQueue(
                replyTo,
                new Buffer(JSON.stringify(response)), {
                  correlationId: msg.properties.correlationId
                }
              ));
            }
            //send ack
            // console.log('messaging:worker done for ' + routeName);
            try {
              ch.ack(msg);
            } catch (e) {
              console.log(e);
            }
          });
      } else {
        ch.ack(msg); //don't call workerFunction  but call ack for next incomming data
      }
    }, {
      noAck: false
    });
    console.log('messaging:worker for queue :' + routeName + ' added, waiting for incoming queue');
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

var pushProviders = {};
/**
 * @returns: promise of push provider: resolves: pushProvider
 */
service.prototype.getPushProvider = function (routeName) {
  if (_.has(pushProviders, routeName)) {
    return _.get(pushProviders, routeName);
  }
  var push = new pushProvider(routeName, connection);
  _.set(pushProviders, routeName, push);
  return push;
};

module.exports = service;
