'use strict';

const PackQueue = require('./packQueue'),
  logger = require('ches-logger');

const assertPackQueue = Symbol('assertPackQueue'),
  queues = Symbol('queues');

class PackQueueManager {
  constructor() {
    this[queues] = new Map();
  }

  [assertPackQueue](queueName, options) {
    const newQueue = new PackQueue(queueName, options.queueSize, options.interval);
    this[queues].set(queueName, newQueue);
    logger.log('verbose', `Created in memory queue(${queueName}) for optimization`);
    return this[queues].get(queueName);
  }

  async addItemToQueue(queueName, data) {
    let queue = this[queues].get(queueName);
    if (!queue) {
      queue = this[assertPackQueue](queueName, {
        queueSize: 20,
        interval: 20000
      });
    }
    return queue.pushToQueue(data);
  }

  async clearAllQueues() {
    this[queues].forEach(async (value, key) => {
      await value.sendAPack();
      this[queues].delete(key);
      logger.log('verbose', `Delete in memory queue(${key})`);
    });
  }
}

module.exports = new PackQueueManager();
