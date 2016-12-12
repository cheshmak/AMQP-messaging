'use strict';
var Q = require('q'),
  _ = require('lodash');
/**
 * @routeName
 * @connection
 */
function Push(routeName, connection) {
  var vm = this;
  this.routeName = routeName;
  this.connection = connection;
  var channelWrapper = vm.connection.createChannel({
    setup: function (channel) {
      return channel.assertQueue(vm.routeName, {
        durable: true
      });
    }
  });
  vm.channelWrapper = channelWrapper;
  vm.responseTimeout = 60000; //any timeout limit, IMPORTANT: if you want to change it you should update queues properties in rabbitmq or delete the queues!
  return Q.resolve(vm);
}


/**
 * @data: json object
 */
Push.prototype.sendPush = function (data) {
  var vm = this;
  var channelWrapper = vm.channelWrapper;
  try {
    Q(channelWrapper.sendToQueue(vm.routeName, new Buffer(JSON.stringify(data))))
      .catch((err) => {
        console.error('error send messaging', err);
      });
  } catch (err) {
    console.log('cant send to queue in messaging queue', err);
  }
  return Q.resolve(vm);
};




function generateUuid() {
  return Math.random().toString() +
    Math.random().toString() +
    Math.random().toString();
}
Push.prototype._getReplyName = function () {
  var vm = this;
  return vm.routeName + '_reply';
};
Push.prototype._registerReceiverChannelWrapper = function () {
  var vm = this;
  if (_.isUndefined(vm.receiverChannelWrapper)) {
    vm.requests = {};
    vm.receiverChannelWrapper = vm.connection.createChannel({
      setup: function (channel) {
        return Q(channel.assertQueue(vm._getReplyName(), {
          durable: true,
          messageTtl: vm.responseTimeout
        })).then(() => {
          var replyName = vm._getReplyName();
          return Q(channel.consume(replyName, (msg) => {
            vm._onResponseReceived(channel, msg);
          }));
        });
      }
    });
  }
  return vm.receiverChannelWrapper;
};
Push.prototype._onResponseReceived = function (channel, msg) {
  var vm = this,
    corrId = _.get(msg, 'properties.correlationId', false);

  if (_.has(vm.requests, corrId)) {
    var entity = _.get(vm.requests, corrId);
    if (entity.timeout !== false) {
      clearTimeout(entity.timeout);
    }
    channel.ack(msg);
    var parsed;
    try {
      parsed = JSON.parse(msg.content.toString());
    } catch (e) {
      console.log('messaging:error parsing rpc call response', {
        routeName: vm._getReplyName(),
        error: e,
        incomingmsg: msg
      });
    }

    if (_.get(parsed, 'success')) {
      entity.deferred.resolve(_.get(parsed, 'result'));
    } else {
      entity.deferred.reject(_.get(parsed, 'error'));
    }
  } else {
    channel.nack(msg);
  }
};


/**
 * @reterns promise of {
 *   success:true/false if worker truly called
 *   result: anything returned from worker
 * }
 */
Push.prototype.rpcCall = function (data) {
  var deferred = Q.defer();
  var vm = this,
    channelWrapper = vm.channelWrapper;
  var correlationId = generateUuid(),
    replyQueue = vm._getReplyName();
  vm._registerReceiverChannelWrapper();
  //no need to catch the result:
  Q.fcall(() => {
    Q(channelWrapper.sendToQueue(
      vm.routeName,
      new Buffer(JSON.stringify(data)), {
        correlationId: correlationId,
        replyTo: replyQueue
      }
    )).catch(() => {
      console.error('amqp: error in connection sendToQueue rpc call');
    }); //no need to return promise, due to error in stability of if not connect

    var timeout = false;
    if (vm.responseTimeout > 0) {
      timeout = setTimeout((corrId) => {
        var entity = _.get(vm.requests, corrId);
        console.error('timeout occured');
        entity.deferred.reject('timeout');
        _.unset(vm.requests, corrId);
      }, vm.responseTimeout, correlationId);
    }
    _.set(vm.requests, correlationId, {
      deferred: deferred,
      timeout: timeout
    });

  }).catch((err) => {
    console.error('rpccall send queue fail', err);
    _.unset(vm.requests, correlationId);
    deferred.reject(err);
  });

  return deferred.promise;
};



module.exports = Push;
