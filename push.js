'use strict';
var Q = require('q'),
  logger = require('ches-logger');
var provider = function (routeName, connection) {
  var scope = this;
  this.routeName = routeName;
  return Q(connection.createChannel().then(function (ch) {
      scope.channel = ch;
      return ch.assertQueue(routeName, {
        durable: true
      });
    }))
    .then(function () {
      return Q.resolve(scope);
    });
};


/**
 * @data: json object
 */
provider.prototype.sendPush = function (data) {
  try {
    this.channel.sendToQueue(this.routeName, new Buffer(JSON.stringify(data)));
    return Q.resolve(provider);
  } catch (err) {
    logger.error('cant send to queue in messaging queue', err);
    return Q.reject(err);
  }
};



module.exports = provider;