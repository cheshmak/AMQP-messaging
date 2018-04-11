'use strict';
const config = require('./config').queue,
  _ = require('lodash'),
  isQueueAsserted = Symbol('isQueueAsserted'),
  setQueueAsserted = Symbol('setQueueAsserted'),
  assertion = {};

class AssertQueue {
  [isQueueAsserted](queueName) {
    if (assertion[queueName]) {
      return true;
    } else {
      return false;
    }
  }
  [setQueueAsserted](queueName) {
    assertion[queueName] = 1;
  }

  async workerQueue(channel, routeName) {
    if (this[isQueueAsserted](routeName)) {
      return true;
    }
    const timeToLive = _.get(config[routeName], 'timeToLive');
    const queueConfig = {
      durable: true
    };
    if (timeToLive > 0) {
      queueConfig.messageTtl = timeToLive;
    }
    const assertedQueue = await channel.assertQueue(routeName, queueConfig);
    this[setQueueAsserted](routeName);
    return assertedQueue;
  }

  async replyQueue(channel, routeName) {
    const timeToLive = _.get(config[routeName], 'timeToLive');
    const queueConfig = {
      durable: true,
      exclusive: true,
      autoDelete: true,
      expires: _.get(config[routeName], 'replyExpires')
    };
    if (timeToLive > 0) {
      queueConfig.messageTtl = timeToLive;
    }
    return await channel.assertQueue('', queueConfig);
  }
}


module.exports = new AssertQueue();
