'use strict';

const Serializer = require('./serializer'),
  channelManager = require('./channelManager');

const qName = Symbol('qName'),
  qSize = Symbol('qSize'),
  interval = Symbol('interval'),
  intervalId = Symbol('timeoutId'),
  queue = Symbol('queue'),
  packQueueItems = Symbol('packQueueItems');

class PackQueue {
  constructor(queueName, maxSize, intervalTime) {
    this[qName] = queueName;
    this[qSize] = maxSize;
    this[interval] = intervalTime;
    this[queue] = [];
    this[intervalId] = setInterval(() => this.sendAPack(), this[interval]);
  }

  async pushToQueue(data) {
    this[queue].push(data);
    if (this[queue].length < this[qSize]) {
      return true;
    }
    await this.sendAPack();
  }

  async [packQueueItems]() {
    if (this[queue].length <= 0) {
      return null;
    }
    const aPack = this[queue];
    this[queue] = []; // we release this.queue as Serializer is async and another code in event loop be able to push to queue
    return await Serializer.serializeJsonObject({
      p: true, // packed
      d: aPack // data
    });
  }

  async sendAPack() {
    const aSerializedPack = await this[packQueueItems]();
    if (!aSerializedPack) {
      return;
    }
    const channel = await channelManager.getChannel();
    return await channel.sendToQueue(this[qName], aSerializedPack, {
      persistent: true
    });
  }
  // clean and exit packQueue
  async exit() {
    clearInterval(this[intervalId]);
    await this.sendAPack();
  }
}

module.exports = PackQueue;
