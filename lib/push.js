'use strict';
const Q = require('q'),
  _ = require('lodash'),
  config = require('./config'),
  assertQueue = require('./assertQueue'),
  BSON = require('bson');
/**
 * @routeName
 * @connection
 */
/**
 *
 * @param routeName
 * @param connection
 * @returns {*}
 * @constructor
 */
function Push(routeName, connection) {
  var vm = this;
  this.routeName = routeName;
  this.connection = connection;
  vm.timeToLive = _.get(config[routeName], 'timeToLive');
  return Q.resolve(vm);
}


/**
 * @data: json object
 */
Push.prototype.sendPush = function (data) {
  var vm = this;
  var channelWrapper = vm.connection.createChannel({
    setup: function (channel) {
      return assertQueue.workerQueue(channel, vm.routeName);
    }
  });
  try {
    let bson = new BSON();
    return Q(channelWrapper.sendToQueue(vm.routeName, bson.serialize(data)))
      .catch((err) => {
        console.error('error send messaging', err);
      })
      .then(()=>{
        channelWrapper.close();
        return Q.resolve(vm);
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
        return assertQueue.workerQueue(channel, vm.routeName);
      }).then(() => {
        return assertQueue.replyQueue(channel, vm.routeName);
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
              let bson = new BSON();
              parsed = bson.deserialize(msg.content, {
                promoteBuffers: true
              });
            } catch (e) {
              console.log('messaging:error parsing rpc call response', {
                routeName: replyName,
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
        });


        //Send to Queue:
        //no need to catch the result:
        if (!isSent) {
          isSent = true; //it ensures that messages is sent only once if amqp connection restarted
          Q.fcall(() => {
            let bson = new BSON();
            Q(channel.sendToQueue(
              vm.routeName,
              bson.serialize(data), {
                correlationId: correlationId,
                replyTo: replyName
              }
            )).catch(() => {
              console.error('amqp: error in connection sendToQueue rpc call');
            }); //no need to return promise, due to error in stability of if not connect


            if (vm.timeToLive > 0) {
              timeout = setTimeout(() => {
                console.error('timeout occured');
                deferred.reject('timeout');
              }, vm.timeToLive);
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
