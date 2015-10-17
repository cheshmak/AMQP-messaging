'use strict';
var Q = require('q');
var provider = function (routeName, context) {
  //connect
  var deferred = Q.defer();
  this.context = context;
  this.socket = this.context.socket('PUSH');
  var scope = this;
  this.socket.connect(routeName, function () {
    deferred.resolve(scope);
  });
  return deferred.promise;
};


/**
 * @data: json object
 */
provider.prototype.sendPush = function (data) {
  this.socket.write(JSON.stringify(data));
};



module.exports = provider;