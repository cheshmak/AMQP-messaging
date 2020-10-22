'use strict';
const
  channelManager = require('../lib/channelManager'),
  packQManager = require('../lib/packQueueManager'),
  chai = require('chai'),
  sinon = require('sinon'),
  _ = require('lodash'),
  Messaging = require('../lib'),
  assertQueue = require('../lib/assertQueue');

chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));
chai.should();

describe('class Messaging', function () {
  this.timeout(10000);
  const queueName = 'messagingtest',
    exchangeName = 'exchangetest';
  let messaging;
  before(async () => {
    messaging = new Messaging();
    const channel = await channelManager.getChannel();
    await channel.deleteQueue(queueName);
  });
  beforeEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    assertQueue.cleanup();
  });
  afterEach(async () => {
    await (await channelManager.getChannel()).purgeQueue();
    await messaging.cancelWorkers();
    await new Promise((resolve1) => setTimeout(resolve1, 100));
  });



  it('should send to worker', () => {
    return new Promise(async (resolve) => {
      await messaging.addWorker(queueName, (data) => {
        data.hi.should.to.equal('true');
        resolve();
      });
      await messaging.sendPush(queueName, {
        hi: 'true'
      });
    });
  });



  // Packing:
  it('should packing work perfectly', async () => {
    const addItemToQueue = sinon.stub(packQManager,'addItemToQueue').returns(Promise.resolve());
    await messaging.sendPush(queueName, {
      hi: 'true'
    }, {
      pack: {
        size: 2
      }
    });
    await messaging.sendPush(queueName, {
      hi: 'true'
    }, {
      pack: {
        size: 2
      }
    });
    addItemToQueue.should.to.be.calledTwice;
    addItemToQueue.restore();
  });

  it('should call workerFunction one by one and not fail if the first one failed', async () => {
    let callCount = 0;
    const workerFunc = function () {
      callCount++;
      if(callCount === 1) {
        throw 'Exception';
      }
    };
    await messaging.addWorker(queueName, workerFunc);
    await messaging.sendPush(queueName, {
      hi: 'true'
    }, {
      pack: {
        size: 2
      }
    });
    await messaging.sendPush(queueName, {
      hi: 'true'
    }, {
      pack: {
        size: 2
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    callCount.should.to.equal(2);
  });



  it('should have a working rpc call', async () => {
    const mybuffer = new Buffer('ohh yeah');
    await messaging.addWorker(queueName, (data) => {
      data.hi.should.to.equal('true');
      return Promise.resolve({
        myinfo: 'yeah',
        extra: {
          mydata: mybuffer
        },
        emptyObj: {}
      });
    });

    const result = await messaging.rpcCall(queueName, {
      hi: 'true'
    });
    result.myinfo.should.to.equal('yeah');
    result.extra.mydata.should.to.deep.equal(mybuffer);
    result.emptyObj.should.to.be.an('object');
    _.size(result.emptyObj).should.to.equal(0);
  });
  it('should work with invalid message', async () => {
    let workerData = null;
    await messaging.addWorker(queueName, async (data) => {
      workerData = data;
    });
    const channel = await channelManager.getChannel();
    await channel.sendToQueue(queueName, Buffer.from('invalid data'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    (workerData === null).should.to.be.true;
  });
  it('should stop messages when calling cancel', async function () {
    this.timeout(10000);
    let canceledReceived = false;
    await messaging.addWorker(queueName, (data) => {
      if (data.canceled === 'ok') {
        canceledReceived = true;
      }
    });
    await new Promise((resolve1) => setTimeout(resolve1, 1000));
    await messaging.sendPush(queueName, {
      hi: 'true'
    });
    await new Promise((resolve1) => setTimeout(resolve1, 300));
    await messaging.cancelWorkers();
    await new Promise((resolve1) => setTimeout(resolve1, 500));
    await messaging.sendPush(queueName, {
      canceled: 'ok'
    }, {
      pack: {
        size: 2
      }
    });
    await new Promise((resolve1) => setTimeout(resolve1, 500));
    if (canceledReceived) {
      throw 'cancel is not working';
    }
  });


  it('should reject with timeout when timeout reached in rpc', async () => {
    await messaging.addWorker(queueName, () => {
      return new Promise(() => {}); // it never resolves
    });
    await messaging.rpcCall(queueName, {
      hi: 'true'
    }, {
      ttl: 200
    }).should.be.rejectedWith('timeout');
  });


  it('should reject when worker returns rejected promise in rpc', async () => {
    await messaging.addWorker(queueName, () => Promise.reject({
      myerr: 'ohh'
    }));
    await messaging.rpcCall(queueName, {}, {
      ttl: 1000
    }).should.be.rejected;
  });

  describe('async function addWorker ->', () => {
    it('Should assert a queue in rabbitmq', async () => {
      // Prepare
      const channel = await channelManager.getChannel();
      // Call target function
      await messaging.addWorker(queueName, () => {});
      // Check Expectations
      const result = await channel.checkQueue(queueName);
      queueName.should.to.equal(result.queue);
    });

    it('Should define a consumer after queue assertion', async () => {
      // Prepare
      const channel = await channelManager.getChannel();
      // Call target function
      await messaging.addWorker(queueName, () => {});
      // Check Expectations
      const result = await channel.checkQueue(queueName);
      result.consumerCount.should.to.equal(1);
    });
  });
  it('Should remove all consumers in rabbitmq', async () => {
    // Prepare
    const channel = await channelManager.getChannel();
    await messaging.addWorker(queueName, () => {});
    // Call target function
    await messaging.cancelWorkers();
    // Check Expectations
    const consumers = _.keys(channel.consumers);
    consumers.length.should.to.equal(0);
  });

  it('Should call packQManager.clearAllQueues()', async () => {
    // Prepare
    const spyOnPackQueueManager = sinon.spy(packQManager, 'clearAllQueues');
    await messaging.addWorker(queueName, () => {});
    // Call target function
    await messaging.cancelWorkers();
    // Check Expectations
    spyOnPackQueueManager.should.be.calledOnce;
    // Restore everything
    spyOnPackQueueManager.restore();
  });

  it('Should subscribe and publish correctly with one subscriber', () => {
    return new Promise((async (resolve, reject) => {
      const sampleMsg = {
        name: 'test content'
      };
      await messaging.subscribe(exchangeName, (res) => {
        try {
          res.should.to.be.deep.equal(sampleMsg);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      await messaging.publish(exchangeName, sampleMsg);
    }));
  });
  it('Should not getting message on publish before subscribing', async () => {
    await messaging.publish(exchangeName, {});
    await new Promise((resolve) => setTimeout(resolve, 200));
    await new Promise(async (resolve, reject) => {
      await messaging.subscribe(exchangeName, () => {
        reject();
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      resolve();
    });
  });

  it('Should get error on invalid params for publish', async () => {
    await messaging.subscribe(exchangeName, Promise.resolve);
    await messaging.publish().should.be.rejected;
    await messaging.publish(exchangeName).should.be.rejected;
    console.log('-=-----------------');
  });

  it('Should work perfectly with two subscribers', async () => {
    let total = 0;
    await messaging.subscribe(exchangeName, ({
      num
    }) => {
      total += num;
    });
    await messaging.subscribe(exchangeName, ({
      num
    }) => {
      total += num;
    });
    await messaging.publish(exchangeName, {
      num: 2
    });
    await new Promise((resolve) => setTimeout(resolve,100));
    total.should.to.equal(4);
  });
});
