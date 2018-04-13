'use strict';
const
  service = require('../lib').service,
  Q = require('q'),
  channelManager = require('../lib/channelManager'),
  chai = require('chai'),
  assert = chai.assert,
  _ = require('lodash'),
  cmd = require('node-cmd');

describe('messaging/endtoendtest', function () {
  const deleteTestsLists = () => {
    cmd.run('rabbitmqadmin delete queue name=messagingtest1');
    cmd.run('rabbitmqadmin delete queue name=messagingtest2');
    cmd.run('rabbitmqadmin delete queue name=messagingtest3');
    cmd.run('rabbitmqadmin delete queue name=messagingtest4');
    cmd.run('rabbitmqadmin delete queue name=messagingtest5');
  };

  beforeEach((done) => {
    Q.fcall(() => {
      deleteTestsLists();
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
          },
          emptyObj: {}
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
      assert.isObject(result.emptyObj);
      assert.isOk(_.size(result.emptyObj) === 0);
      return new service().then((sq) => {
        return sq.cancelWorker(queueName);
      });
    });
  });

  it('should work with invalid message', async () => {
    const queueName = 'messagingtest1';
    const sleep = (t) => {
      return new Promise((resolve) => {
        setTimeout(resolve, t);
      });
    };

    const serviceWrapper = await new service();
    let workerData = null;
    serviceWrapper.addWorker(queueName, (data) => {
      workerData = data;
    });
    const channel = await channelManager.getChannel();
    await channel.assertQueue(queueName);
    await channel.sendToQueue(queueName, Buffer('invalid data'));
    await sleep(200);
    assert.isNull(workerData);
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
