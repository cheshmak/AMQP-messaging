'use strict';

const PackQueue = require('./packQueue'),
  logger = require('ches-logger');

class PackQueueManager {
  constructor() {
    this.queues = new Map();
  }

  assertPackQueue(queueName, sendFunction, options) {
    const newQueue = new PackQueue(queueName, sendFunction, options.queueSize, options.interval);
    this.queues.set(queueName, newQueue);
    logger.log('verbose', `Created in memory queue(${queueName}) for optimization`);
  }

  async addItemToQueue(queueName, data) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return; // You should make queue with messaging.addWorker method first
    }
    return queue.pushToQueue(data);
  }
}

module.exports = new PackQueueManager();
