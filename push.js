'use strict';
var Q = require('q'),
  _ = require('lodash');

function Push(routeName, connection) {
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
}


/**
 * @data: json object
 */
Push.prototype.sendPush = function (data) {
  try {
    this.channel.sendToQueue(this.routeName, new Buffer(JSON.stringify(data)));
    return Q.resolve(this);
  } catch (err) {
    console.log('cant send to queue in messaging queue', err);
    return Q.reject(err);
  }
};


function generateUuid() {
    return Math.random().toString() +
      Math.random().toString() +
      Math.random().toString();
  }
  /**
   * @reterns promise of {
   *   success:true/false if worker truly called
   *   result: anything returned from worker
   * }
   */
Push.prototype.rpcCall = function (data) {
  var deferred = Q.defer();
  try {
    var vm = this;
    var correlationId = generateUuid(),
      replyQueue = vm.routeName + '_reply';
    Q(vm.channel.assertQueue(replyQueue, {
        durable: true
      }))
      .then(() => {
        return Q(vm.channel.consume(replyQueue, (msg) => {
          if (_.get(msg, 'properties.correlationId', false) === correlationId) {
            vm.channel.ack(msg);
            var name = _.get(msg, 'fields.consumerTag');
            vm.channel.cancel(name);
            var parsed;
            try {
              parsed = JSON.parse(msg.content.toString());
            } catch (e) {
              console.log('messaging:error parsing rpc call response', {
                routeName: replyQueue,
                error: e,
                incomingmsg: msg
              });
            }
            deferred.resolve(parsed);
          } else {
            vm.channel.nack(msg);
          }
        }));
      })
      .then(() => {
        return Q(vm.channel.sendToQueue(
          vm.routeName,
          new Buffer(JSON.stringify(data)), {
            correlationId: correlationId,
            replyTo: replyQueue
          }
        ));
      });
  } catch (err) {
    console.log('cant send to queue in messaging queue', err);
    deferred.reject(err);
  }
  return deferred.promise;
};



module.exports = Push;
