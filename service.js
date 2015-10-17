'use strict';
var Q = require('q'),
  rabbit = require('rabbit.js'),
  _ = require('lodash'),
  pushProvider = require('./push');
/**
 * resolves service
 * @prefetchCount: int: count of messages send before calling any ack
 */
var service = function (prefetchCount) {
  this.pushProviders = {};
  this.prefetchCount = prefetchCount || 1;
};
service.prototype.connect = function () {
  //connect
  var deferred = Q.defer();
  this.context = rabbit.createContext();
  var scope = this;
  this.context.on('ready', function () {
    deferred.resolve(scope);
  });
  return deferred.promise;
};



/**
 * it adds a worker to queue
 * when a route comes for @routeName it calls @workerFunction
 * @routeName: route name
 * @workerFunction{PROMISE}: function: parameters: JSON parsed received, returns promise
 * 
 */
service.prototype.addWorker = function (routeName, workerFunction) {
  var worker = this.context.socket('WORKER', {
    prefetch: this.prefetchCount
  });
  worker.setEncoding('utf8');
  worker.connect(routeName, function () {
    worker.on('data', function (data) {
      var parsed = JSON.parse(data);
      workerFunction(parsed)
        .done(function () {
          //send ack
          console.log('ack called');
          worker.ack();
        });
    });
  });
};

/**
 * @returns: promise of push provider: resolves: pushProvider
 */
service.prototype.getPushProvider = function (routeName) {
  if (_.has(this.pushProviders, routeName)) {
    return _.get(this.pushProviders, routeName);
  }
  var push = new pushProvider(routeName, this.context);
  _.set(this.pushProviders, routeName, push);
  return push;
};

module.exports = service;
