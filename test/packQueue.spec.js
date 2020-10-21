'use strict';
const PackQueue = require('../lib/packQueue'),
  channelManager = require('../lib/channelManager'),
  Serializer = require('../lib/serializer'),
  sinon = require('sinon'),
  chai = require('chai');

chai.should();
chai.use(require('sinon-chai'));

describe('packQueue', function () {
  it('should pack and send to messaging ', async () => {
    const channel = {
      sendToQueue: () => {
        return Promise.resolve();
      }
    };
    const getChannel = sinon.stub(channelManager,'getChannel').returns(Promise.resolve(channel));
    const sendToQueue = sinon.spy(channel,'sendToQueue');
    const pack = new PackQueue('sampleQueue', 10, 20000);
    await pack.pushToQueue({
      sample: 'ok',
      hello: 100
    });
    sendToQueue.should.have.not.been.called;
    await pack.sendAPack();
    sendToQueue.getCall(0).args[0].should.to.equal('sampleQueue');
    sendToQueue.getCall(0).args[1].should.to.deep.equal(await Serializer.serializeJsonObject({
      p: true,
      d: [{
        sample: 'ok',
        hello: 100
      }]
    }));


    await pack.exit();

    getChannel.restore();
    sendToQueue.restore();
  });

  it('should pack and send to amqp when maxSize reached ', async () => {
    const channel = {
      sendToQueue: () => {
        return Promise.resolve();
      }
    };
    const getChannel = sinon.stub(channelManager,'getChannel').returns(Promise.resolve(channel));
    const sendToQueue = sinon.spy(channel,'sendToQueue');
    const pack = new PackQueue('sampleQueue', 2, 20000);
    await pack.pushToQueue({
      sample: 'ok',
      hello: 100
    });
    sendToQueue.should.have.not.been.called;
    await pack.pushToQueue({
      sample: 'ok',
      hello: 200
    });
    sendToQueue.getCall(0).args[0].should.to.equal('sampleQueue');
    sendToQueue.getCall(0).args[1].should.to.deep.equal(await Serializer.serializeJsonObject({
      p: true,
      d: [{
        sample: 'ok',
        hello: 100
      }, {
        sample: 'ok',
        hello: 200
      }]
    }));


    await pack.exit();

    getChannel.restore();
    sendToQueue.restore();
  });
  it('should pack when interval reached', async () => {
    const channel = {
      sendToQueue: () => {
        return Promise.resolve();
      }
    };
    const getChannel = sinon.stub(channelManager,'getChannel').returns(Promise.resolve(channel));
    const sendToQueue = sinon.spy(channel,'sendToQueue');
    const pack = new PackQueue('sampleQueue', 1000, 200);
    await pack.pushToQueue({
      sample: 'ok',
      hello: 100
    });
    await pack.pushToQueue({
      sample: 'ok',
      hello: 200
    });
    sendToQueue.should.have.not.been.called;
    await new Promise((resolve) => setTimeout(resolve,500));
    sendToQueue.getCall(0).args[0].should.to.equal('sampleQueue');
    sendToQueue.getCall(0).args[1].should.to.deep.equal(await Serializer.serializeJsonObject({
      p: true,
      d: [{
        sample: 'ok',
        hello: 100
      }, {
        sample: 'ok',
        hello: 200
      }]
    }));


    await pack.exit();

    getChannel.restore();
    sendToQueue.restore();
  });
});
