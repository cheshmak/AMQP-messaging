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
  try{
    this.socket.write(JSON.stringify(data));
    return Q.resolve(provider);
  } catch(err){
    return Q.reject(err);
  }
};



module.exports = provider;