'use strict';

const MainModule = require('../lib'),
  packQManager = require('../lib/packQueueManager'),
  chai = require('chai'),
  sinon = require('sinon');

chai.use(require('sinon-chai'));
chai.should();

describe('packQueue class', () => {
  let mainModule;
  before(() => {
    mainModule = new MainModule();
  });

  it('Should add a queue when a worker added', async () => {
    // Mock section
    const mockAssertPackQueue = sinon.spy(packQManager, 'assertPackQueue');
    // Call target function
    await mainModule.addWorker('testQueue1', () => {});
    // Expectations check
    mockAssertPackQueue.should.be.calledOnce;
    // Restore everything
    mockAssertPackQueue.restore();
  });

  it('Should add item when call sendPush', async () => {
    // Mock section
    const mockAddItemInQueue = sinon.spy(packQManager, 'addItemInQueue');
    await mainModule.addWorker('testQueue2', () => {});
    // Call target function
    await mainModule.sendPush('testQueue2', {
      fakeData: true
    }, false);
    // Expectations check
    mockAddItemInQueue.should.be.calledOnce;
    // Restore everything
    mockAddItemInQueue.restore();
  });
});
