'use strict';
const
  service = require('../lib').service,
  topic = require('../lib/Topic'),
  Q = require('q'),
  assert = require('chai').assert,
  expect = require('chai').expect,
  cmd = require('node-cmd');

const ex1 = 'exchangetest1';

describe('messaging/endtoendtest', function () {
  beforeEach((done) => {
    Q.fcall(() => {
      cmd.run('rabbitmqadmin delete queue name=messagingtest1');
      cmd.run('rabbitmqadmin delete queue name=messagingtest2');
      cmd.run('rabbitmqadmin delete queue name=messagingtest3');
      cmd.run('rabbitmqadmin delete queue name=messagingtest4');
      cmd.run('rabbitmqadmin delete queue name=messagingtest5');

      cmd.run(`rabbitmqadmin delete exchange name=${ex1}`);
    }).then(() => {
      setTimeout(() => {
        done();
      }, 200);
    });
  });

  it('should send to worker', () => {
    const deferred = Q.defer(),
      queueName = 'messagingtest1';

    new service().then(function (serviceQueue) {
      serviceQueue.addWorker(queueName, (data) => {
        assert.equal(data.hi, 'true');
        deferred.resolve();
        serviceQueue.cancelWorker(queueName) // prevent this for handling next
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
    }).catch((err) => {
      deferred.reject(err);
    });

    return deferred.promise;
  });

  it('Should publish and subscribe correctly', () => {
  /*
    const defer = Q.defer(),
      sampleMsg = {
        name: 'test content'
      };

    topic.subscribe(ex1, (res) => {
      expect(res).to.be.deep.equal(sampleMsg);
      defer.resolve();
    });

    topic.publish(ex1, sampleMsg)
      .then((res) => {
        console.log(res);
      })
      .catch((err) => {
        defer.reject(err);
      });

    return defer.promise;
  */
  })
  it('should work find with rpc', () => {
    const queueName = 'messagingtest2';

    const mybuffer = new Buffer('ohh yeah');

    new service().then(function (serviceQueue) {
      serviceQueue.addWorker(queueName, (data) => {
        assert.equal(data.hi, 'true');

        return Q.resolve({
          myinfo: 'yeah',
          extra: {
            mydata: mybuffer
          }
        });
      });
    });

    return new service().then((serve) => {
      return serve.getPushProvider(queueName);
    }).then((pushSender) => {
      return pushSender.rpcCall({
        hi: 'true'
      });
    }).then((result) => {
      assert.deepEqual(result.myinfo, 'yeah');
      assert.deepEqual(result.extra.mydata, mybuffer);
    });
  });

  it('should stop messages when calling cancel', () => {
    const deferred = Q.defer(),
      queueName = 'messagingtest3';
    let serviceQ,
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
    const queueName = 'messagingtest4';
    let isRejected = false;

    return Q.fcall(() => {
      return new service();
    }).then((serve) => {
      return serve.getPushProvider(queueName);
    }).then((pushSender) => {
      return pushSender.rpcCall({
        hi: 'true'
      });
    }).catch((err) => {
      assert.equal(err, 'timeout');
      isRejected = true;
    }).then(() => {
      assert.isOk(isRejected);
    });
  });

  it('should reject when worker returns rejected promise in rpc', () => {
    const queueName = 'messagingtest5';

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
    }).catch((err) => {
      if (err === 'Error1') {
        throw 'not worked correctly';
      } else {
        assert.equal(err.myerr, 'ohh');
      }
    });
  });
});
