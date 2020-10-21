'use strict';
const PackQueue = require('../lib/packQueue'),
  PackQueueManager = require('../lib/packQueueManager'),
  sinon = require('sinon'),
  chai = require('chai');

chai.should();
chai.use(require('sinon-chai'));

describe('packQueueManager', function () {
  it('should manage PackQueue', async () => {
    const pushToQueue = sinon.stub(PackQueue.prototype,'pushToQueue').returns(Promise.resolve());
    const exit = sinon.spy(PackQueue.prototype,'exit');

    await PackQueueManager.addItemToQueue('sampleQueue', {
      sample: 'ok'
    },{
      queueSize: 20,
      interval: 20000
    });
    pushToQueue.should.to.have.been.calledWith({
      sample: 'ok'
    });

    await PackQueueManager.clearAllQueues();
    exit.should.have.been.calledOnce;

    pushToQueue.restore();
    exit.restore();
  });
});
