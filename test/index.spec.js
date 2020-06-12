'use strict';
const
  service = require('../lib').service,
  channelManager = require('../lib/channelManager'),
  packQManager = require('../lib/packQueueManager'),
  Q = require('q'),
  chai = require('chai'),
  sinon = require('sinon'),
  assert = chai.assert,
  _ = require('lodash'),
  cmd = require('node-cmd'),
  Messaging = require('../lib');

chai.use(require('sinon-chai'));
chai.should();

describe('Messaging - Service (Backward compatibility)', function () {
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
        serviceQueue.cancelWorker() // prevent this for handling next
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
        return sq.cancelWorker();
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

    Q.fcall(() => {}).then(() => {
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
        return serviceQ.cancelWorker();
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

describe('class Messaging', function () {
  let messaging;
  before(() => {
    messaging = new Messaging();
  });

  describe('async function addWorker ->', () => {
    it('Should assert a queue in rabbitmq', async () => {
      // Prepare
      const channel = await channelManager.getChannel();
      const queueName = 'myFirstTestQueue';
      // Call target function
      await messaging.addWorker(queueName, () => {});
      // Check Expectations
      const result = await channel.checkQueue(queueName);
      assert.equal(queueName, result.queue);
    });

    it('Should define a consumer after queue assertion', async () => {
      // Prepare
      const channel = await channelManager.getChannel();
      const queueName = 'mySecondTestQueue';
      // Call target function
      await messaging.addWorker(queueName, () => {});
      // Check Expectations
      const result = await channel.checkQueue(queueName);
      assert.equal(1, result.consumerCount);
    });
  });

  describe('async function cancelWorkers ->', () => {
    it('Should remove all consumers in rabbitmq', async () => {
      // Prepare
      const channel = await channelManager.getChannel();
      const queueName = 'myThirdTestQueue';
      await messaging.addWorker(queueName, () => {});
      // Call target function
      await messaging.cancelWorkers();
      // Check Expectations
      const consumers = _.keys(channel.consumers);
      assert.equal(0, consumers.length);
    });

    it('Should call packQManager.clearAllQueues()', async () => {
      // Prepare
      const spyOnPackQueueManager = sinon.spy(packQManager, 'clearAllQueues');
      const queueName = 'myThirdTestQueue';
      await messaging.addWorker(queueName, () => {});
      // Call target function
      await messaging.cancelWorkers();
      // Check Expectations
      spyOnPackQueueManager.should.be.calledOnce;
      // Restore everything
      spyOnPackQueueManager.restore();
    });
  });
});
