'use strict';

const
  chai = require('chai'),
  channelManager = require('../lib/channelManager');
chai.should();
describe('channel manager', function () {
  it('Should work generate channel', async () => {
    const channel1 = await channelManager.getChannel();
    const channel2 = await channelManager.getChannel();
    (channel1 === channel2).should.to.be.true;
    channel1.should.to.be.an('object');
  });
});
