'use strict';
const service = require('../lib').service,
  Q = require('q'),
  assert = require('chai').assert,
  cmd = require('node-cmd');

describe('messaging/endtoendtest', function () {
  beforeEach((done) => {
    Q.fcall(() => {
      cmd.run('rabbitmqadmin delete queue name=messagingtest1');
      cmd.run('rabbitmqadmin delete queue name=messagingtest2');
      cmd.run('rabbitmqadmin delete queue name=messagingtest3');
      cmd.run('rabbitmqadmin delete queue name=messagingtest4');
      cmd.run('rabbitmqadmin delete queue name=messagingtest5');
    }).then(() => {
      setTimeout(() => {
        done();
      }, 200);

    });
  });
  it('should send to worker', () => {
    let deferred = Q.defer(),
      queueName = 'messagingtest1';
    new service().then(function (serviceQueue) {
      serviceQueue.addWorker(queueName, (data) => {
        assert.equal(data.hi, 'true');
        deferred.resolve();
        serviceQueue.cancelWorker(queueName) //prevent this for handling next
          .then(() => {
            deferred.resolve();
          });
        return Q.resolve();
      });
    });
    new service().then((serve) => {
      return serve.getPushProvider(queueName);
    }).then((pushSender) => {
      return pushSender.sendPush({
        hi: 'true'
      });
    }).catch(err => {
      deferred.reject(err);
    });
    return deferred.promise;
  });
  it('should work find with rpc', () => {
    let queueName = 'messagingtest2';
    new service().then(function (serviceQueue) {
      serviceQueue.addWorker(queueName, (data) => {
        assert.equal(data.hi, 'true');
        return Q.resolve({
          myinfo: 'yeah'
        });
      });
    });
    return new service().then((serve) => {
      return serve.getPushProvider(queueName);
    }).then((pushSender) => {
      return pushSender.rpcCall({
        hi: 'true'
      });
    }).then(result => {
      assert.equal(result.myinfo, 'yeah');
    });
  });

  it('should stop messages when calling cancel', () => {
    let deferred = Q.defer(),
      queueName = 'messagingtest3',
      serviceQ,
      sender,
      hiProcessed = Q.defer(),
      cancelProcessed = false;
    Q.fcall(() => {

      }).then(() => {
        return new service();
      })
      .then(function (serviceQueue) {
        serviceQ = serviceQueue;
        return serviceQueue.addWorker(queueName, (data) => {
          if (data.hi === 'true') {
            hiProcessed.resolve();
          } else {
            cancelProcessed = true;
          }
          hiProcessed = true;
          return Q.resolve();
        });
      }).then(() => {
        return new service();
      })
      .then((serve) => {
        return serve.getPushProvider(queueName);
      }).then((pushSender) => {
        sender = pushSender;
        return pushSender.sendPush({
          hi: 'true'
        });
      }).then(() => {
        return hiProcessed.promise;
      }).then(() => {
        return serviceQ.cancelWorker(queueName);
      }).then(() => {

        setTimeout(() => {
          sender.sendPush({
            hi: 'ERROR'
          });
          setTimeout(() => {
            if (cancelProcessed) {
              deferred.reject(new Error('cancel not worked'));
            } else {
              deferred.resolve();
            }
          }, 200);
        }, 200);
      });
    return deferred.promise;
  });


  it('should reject with timeout when timeout reached in rpc', () => {
    let queueName = 'messagingtest4',
      isRejected = false;
    return Q.fcall(() => {
      return new service();
    }).then(serve => {
      return serve.getPushProvider(queueName);
    }).then((pushSender) => {
      return pushSender.rpcCall({
        hi: 'true'
      });
    }).catch(err => {
      assert.equal(err, 'timeout');
      isRejected = true;
    }).then(() => {
      assert.isOk(isRejected);
    });
  });


  it('should reject when worker returns rejected promise in rpc', () => {
    let queueName = 'messagingtest5';
    new service().then(function (serviceQueue) {
      serviceQueue.addWorker(queueName, () => {
        return Q.reject({
          myerr: 'ohh'
        });
      });
    });
    return new service().then((serve) => {
      return serve.getPushProvider(queueName);
    }).then((pushSender) => {
      return pushSender.rpcCall({
        hir: 'true'
      });
    }).then(() => {
      throw 'Error1';
    }).catch(err => {
      if (err === 'Error1') {
        throw 'not worked correctly';
      } else {
        assert.equal(err.myerr, 'ohh');
      }
    });
  });

});
