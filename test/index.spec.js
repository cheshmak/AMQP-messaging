'use strict';
const
  service = require('../lib').service,
  system = require('../lib/System'),
  topic = require('../lib/Topic'),
  Q = require('q'),
  _ = require('lodash'),
  chai = require('chai'),
  assert = chai.assert,
  expect = chai.expect,
  cmd = require('node-cmd');

chai.use(require('chai-as-promised'));

const ex1 = 'exchangetest1',
  ex2 = 'exchangetest2';

describe('messaging/endtoendtest', function () {
  const deleteTestsLists = () => {
    cmd.run('rabbitmqadmin delete queue name=messagingtest1');
    cmd.run('rabbitmqadmin delete queue name=messagingtest2');
    cmd.run('rabbitmqadmin delete queue name=messagingtest3');
    cmd.run('rabbitmqadmin delete queue name=messagingtest4');
    cmd.run('rabbitmqadmin delete queue name=messagingtest5');

    cmd.run(`rabbitmqadmin delete exchange name=${ex1}`);
    cmd.run(`rabbitmqadmin delete exchange name=${ex2}`);
  };

  beforeEach((done) => {
    Q.fcall(() => {
      system.closeConnection();
      deleteTestsLists();
    }).then(() => {
      setTimeout(() => {
        done();
      }, 200);
    });
  });

  afterEach((done) => {
    Q.fcall(() => {
      system.closeConnection();
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

  describe('Publish/Subscribe', () => {
    it('Should subscribe and publish correctly with one subscriber', () => {
      const
        defer = Q.defer(),
        sampleMsg = {
          name: 'test content'
        };

      topic.subscribe(ex1, (res) => {
        try {
          expect(res).to.be.deep.equal(sampleMsg);
          defer.resolve();
        } catch (err) {
          defer.reject(err);
        }
      }).then(() => {
        topic.publish(ex1, sampleMsg);
      });

      return defer.promise;
    });

    it('Should subscribe and publish correctly with more than one subscribers', () => {
      const sampleMsg = {
          name: 'test content',
          buf: new Buffer('Test data for buffer')
        },
        defer1 = Q.defer(),
        defer2 = Q.defer();

      topic.subscribe(ex2, (res) => {
        try {
          expect(res).to.be.deep.equal(sampleMsg);
          defer1.resolve();
        } catch (err) {
          defer1.reject(err);
        }
      }).then(() => {
        return topic.subscribe(ex2, (res) => {
          try {
            expect(res).to.be.deep.equal(sampleMsg);
            defer2.resolve();
          } catch (err) {
            defer2.reject(err);
          }
        });
      }).then(() => {
        topic.publish(ex1, sampleMsg);
        topic.publish(ex2, sampleMsg);
      });

      return Q.all([defer1.promise, defer2.promise]);
    });

    it('Should not getting message on publish before subscribing', function () {
      this.timeout(10000);
      const defer = Q.defer();

      topic.publish(ex1, {})
        .then(() => {
          setTimeout(() => {
            defer.resolve();
          }, 7000);
          return topic.subscribe(ex1, () => {
            defer.reject();
          });
        });

      return defer.promise;
    });

    it('Should get error on invalid params for publish', function () {
      expect(topic.publish()).be.rejected;
      expect(topic.publish(ex1)).be.rejected;
    });

    it('Should get error on invalid params for subscribe', function () {
      expect(topic.subscribe()).be.rejected;
    });

    it('Should invalid consumer function passed', function () {
      this.timeout(4000);
      const
        defer = Q.defer(),
        sampleMsg = {
          name: 'test content'
        };

      /* eslint
      no-unused-vars: ["warn"]
      no-undef: ["warn"]
      */
      topic.subscribe(ex1, (res) => {
        setTimeout(() => {
          defer.resolve();
        }, 2000);
        const fun = 0;
        func(res);
      }).then(() => {
        topic.publish(ex1, sampleMsg);
      });

      return defer.promise;
    });
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
