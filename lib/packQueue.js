'use strict';

const Serializer = require('./serializer');

class PackQueue {
  constructor(queueName, sendFunction, queueSize, interval) {
    this.qName = queueName;
    this.qSize = queueSize;
    this.interval = interval;
    this.timeoutId = null;
    this.queue = [];
    this.sendToQueue = sendFunction;
    this.resetSendInterval();
  }

  resetSendInterval() {
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => this.sendAPack(), this.interval);
  }

  async pushToQueue(data) {
    this.queue.push(data);
    if (this.queue.length < this.qSize) {
      return Promise.resolve(true);
    }
    return this.sendAPack();
  }

  async packQueueItems() {
    if (this.queue.length <= 0) {
      return null;
    }
    const aPack = [];
    const iterations = this.queue.length < this.qSize ? this.queue.length : this.qSize;
    for (let i = 0; i < iterations; i++) {
      aPack.push(this.queue.pop());
    }
    return Serializer.serializeJsonObject({
      packed: true,
      items: aPack
    });
  }

  async sendAPack() {
    const aSerializedPack = await this.packQueueItems();
    this.resetSendInterval();
    if (!aSerializedPack) {
      return;
    }
    return await this.sendToQueue(this.qName, aSerializedPack);
  }
}

module.exports = PackQueue;
