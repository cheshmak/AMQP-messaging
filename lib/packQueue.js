'use strict';

const Serializer = require('./serializer'),
  channelManager = require('./channelManager');

const qName = Symbol('qName'),
  qSize = Symbol('qSize'),
  interval = Symbol('interval'),
  timeoutId = Symbol('timeoutId'),
  queue = Symbol('queue'),
  resetSendInterval = Symbol('resetSendInterval');

class PackQueue {
  constructor(queueName, queueSize, intervalTime) {
    this[qName] = queueName;
    this[qSize] = queueSize;
    this[interval] = intervalTime;
    this[timeoutId] = null;
    this[queue] = [];
    this[resetSendInterval]();
  }

  [resetSendInterval]() {
    clearTimeout(this[timeoutId]);
    this[timeoutId] = setTimeout(() => this.sendAPack(), this[interval]);
  }

  async pushToQueue(data) {
    this[queue].push(data);
    if (this[queue].length < this[qSize]) {
      return Promise.resolve(true);
    }
    return this.sendAPack();
  }

  async packQueueItems() {
    if (this[queue].length <= 0) {
      return null;
    }
    const aPack = [];
    const iterations = this[queue].length < this[qSize] ? this[queue].length : this[qSize];
    for (let i = 0; i < iterations; i++) {
      aPack.push(this[queue].pop());
    }
    return Serializer.serializeJsonObject({
      p: true, // packed
      d: aPack // data
    });
  }

  async sendAPack() {
    const aSerializedPack = await this.packQueueItems();
    this[resetSendInterval]();
    if (!aSerializedPack) {
      return;
    }
    const channel = await channelManager.getChannel();
    return await channel.sendToQueue(this[qName], aSerializedPack, {
      persistent: true
    });
  }
}

module.exports = PackQueue;
