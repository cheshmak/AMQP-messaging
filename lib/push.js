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
  /**
   * @reterns promise of {
   *   success:true/false if worker truly called
   *   result: anything returned from worker
   * }
   */
Push.prototype.rpcCall = function (data) {
  let deferred = Q.defer(),
    vm = this,
    correlationId = generateUuid(),
    timeout,
    channelWrapper;

  let resolve = function (data) {
    channelWrapper.close();
    deferred.resolve(data);
  };
  let reject = function (err) {
    channelWrapper.close();
    deferred.reject(err);
  };
  let isSent = false;
  channelWrapper = vm.connection.createChannel({
    setup: function (channel) {
      return Q.fcall(() => {
        return channel.assertQueue(vm.routeName, {
          durable: true
        });
      }).then(() => {
        return Q(channel.assertQueue('', {
          durable: true,
          messageTtl: vm.responseTimeout,
          exclusive: true
        }));
      }).then(q => {
        let replyName = q.queue;
        channel.consume(replyName, (msg) => {
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
                routeName: replyName,
                error: e,
                incomingmsg: msg
              });
            }
            Q.fcall(() => {
              //  return channel.deleteQueue(replyName);
            }).done(() => {
              if (_.get(parsed, 'success')) {
                resolve(_.get(parsed, 'result'));
              } else {
                reject(_.get(parsed, 'result'));
              }
            });


          } else {
            channel.nack(msg);
          }
        });


        //Send to Queue:
        //no need to catch the result:
        if (!isSent) {
          isSent = true; //it ensures that messages is sent only once if amqp connection restarted
          Q.fcall(() => {
            Q(channel.sendToQueue(
              vm.routeName,
              new Buffer(JSON.stringify(data)), {
                correlationId: correlationId,
                replyTo: replyName
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

        }
      });
    }

  });



  return deferred.promise;
};



module.exports = Push;
