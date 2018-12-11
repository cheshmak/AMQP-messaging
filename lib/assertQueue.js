'use strict';
const config = require('./config').queue,
  _ = require('lodash'),
  isQueueAsserted = Symbol('isQueueAsserted'),
  setQueueAsserted = Symbol('setQueueAsserted'),
  queueAssertion = Symbol('queueAssertion'),
  replyAssertion = Symbol('replyAssertion');

class AssertQueue {
  constructor() {
    this[queueAssertion] = {};
    this[replyAssertion] = {};
  }

  [isQueueAsserted](queueName) {
    return !!this[queueAssertion][queueName];
  }
  [setQueueAsserted](queueName) {
    this[queueAssertion][queueName] = 1;
  }

  async workerQueue(channel, routeName, options) {
    if (this[isQueueAsserted](routeName)) {
      return true;
    }
    const timeToLive = _.get(options, 'ttl') || _.get(config[routeName], 'timeToLive');
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

  async replyQueue(channel, routeName, options) {
    if (this[replyAssertion][routeName]) {
      return this[replyAssertion][routeName];
    }
    const queueConfig = {
      durable: true,
      exclusive: true,
      autoDelete: true
    };
    const timeToLive = _.get(options, 'ttl') || _.get(config[routeName], 'timeToLive');
    if (timeToLive > 0) {
      queueConfig.messageTtl = timeToLive;
    }
    const queueName = `${routeName}-reply-${Math.random().toString(36).slice(2)}`;
    this[replyAssertion][routeName] = queueName; // We first mark it as asserted to prevent parallel assertion on a same queue
    try {
      await channel.assertQueue(queueName, queueConfig);
    } catch (e) {
      delete this[replyAssertion][routeName];
    }
    return queueName;
  }
}


module.exports = new AssertQueue();
