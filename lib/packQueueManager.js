'use strict';

const PackQueue = require('./packQueue'),
  _ = require('lodash');

const assertPackQueue = Symbol('assertPackQueue'),
  queues = Symbol('queues');

class PackQueueManager {
  constructor() {
    this[queues] = new Map();
  }

  [assertPackQueue](queueName, options) {
    const newQueue = new PackQueue(queueName, options.queueSize, options.interval);
    this[queues].set(queueName, newQueue);
    return this[queues].get(queueName);
  }

  async addItemToQueue(queueName, data, options) {
    let queue = this[queues].get(queueName);
    if (!queue) {
      queue = this[assertPackQueue](queueName, {
        queueSize: _.get(options, 'queueSize'),
        interval: _.get(options,'interval')
      });
    }
    return queue.pushToQueue(data);
  }

  async clearAllQueues() {
    for(const queue of this[queues].values()) {
      await queue.exit();
    }
    this[queues].clear();
  }
}

module.exports = new PackQueueManager();
