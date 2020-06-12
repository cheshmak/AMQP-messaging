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
        queueSize: 10,
        interval: 500
      });
    }
    return queue.pushToQueue(data);
  }
}

module.exports = new PackQueueManager();
