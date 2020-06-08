'use strict';

const PackQueue = require('./packQueue'),
  configs = require('./config'),
  logger = require('ches-logger');

class PackQueueManager {
  constructor() {
    this.queues = new Map();
  }

  assertPackQueue(queueName, sendFunction, queueSize = configs.PACK_QUEUE_LIMITATION, interval = configs.PACK_QUEUE_INTERVAL) {
    const newQueue = new PackQueue(queueName, sendFunction, queueSize, interval);
    this.queues.set(queueName, newQueue);
    logger.log('verbose', `Created in memory queue(${queueName}) for optimization`);
  }

  async addItemInQueue(queueName, data) {
    const queue = this.queues.get(queueName);
    // logger.log('verbose', `Add item into in memory queue(${queueName})`);
    return queue.pushToQueue(data);
  }
}

module.exports = new PackQueueManager();
