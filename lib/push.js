'use strict';
var Q = require('q'),
  _ = require('lodash');
/**
 * @routeName
 * @connection
 */
/**
 *
 * @param routeName
 * @param connection
 * @param options :
 * responseTimeout: int , default: 60000ms , it is used just in rpc calls
 * @returns {*}
 * @constructor
 */
function Push(routeName, connection, options) {
  var vm = this;
  this.routeName = routeName;
  this.connection = connection;


  vm.responseTimeout = _.get(options, 'responseTimeout', 60000); //any timeout limit, IMPORTANT: if you want to change it you should update queues properties in rabbitmq or delete the queues!
  return Q.resolve(vm);
}


/**
 * @data: json object
 */
Push.prototype.sendPush = function (data) {
  var vm = this;
  var channelWrapper = vm.connection.createChannel({
    setup: function (channel) {
      return channel.assertQueue(vm.routeName, {
        durable: true
      });
    }
  });
  try {
    Q(channelWrapper.sendToQueue(vm.routeName, new Buffer(JSON.stringify(data))))
      .catch((err) => {
        console.error('error send messaging', err);
      })
      .done(() => {
        channelWrapper.close();
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


/**
 * @reterns promise of {
 *   success:true/false if worker truly called
 *   result: anything returned from worker
 * }
 */
Push.prototype.rpcCall = function (data) {
  var deferred = Q.defer();
  var vm = this,
    channelWrapper = vm.connection.createChannel({
      setup: function (channel) {
        return channel.assertQueue(vm.routeName, {
          durable: true
        });
      }
    });
  var correlationId = generateUuid(),
    replyQueue = vm._getReplyName(),
    timeout,
    receiverChannelWrapper;

  var resolve = function (data) {
    deferred.resolve(data);
    channelWrapper.close();
    receiverChannelWrapper.close();
  };
  var reject = function (err) {
    deferred.reject(err);
    channelWrapper.close();
    receiverChannelWrapper.close();
  };

  receiverChannelWrapper = vm.connection.createChannel({
    setup: function (channel) {
      return Q(channel.assertQueue(vm._getReplyName(), {
        durable: true,
        messageTtl: vm.responseTimeout
      })).then(() => {
        var replyName = vm._getReplyName();
        return Q(channel.consume(replyName, (msg) => {
          var corrId = _.get(msg, 'properties.correlationId', false);
          if (corrId === correlationId) {
            if (timeout) {
              clearTimeout(timeout);
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
              resolve(_.get(parsed, 'result'));
            } else {
              reject(_.get(parsed, 'result'));
            }
          } else {
            channel.nack(msg);
          }
        }));
      });
    }
  });

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


    if (vm.responseTimeout > 0) {
      timeout = setTimeout(() => {
        console.error('timeout occured');
        deferred.reject('timeout');
      }, vm.responseTimeout);
    }
  }).catch((err) => {
    console.error('rpccall send queue fail', err);
    reject(err);
  });

  return deferred.promise;
};



module.exports = Push;
