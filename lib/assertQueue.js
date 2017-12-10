'use strict';
const config = require('./config'),
  _ = require('lodash');

module.exports = {
  workerQueue: async (channel, routeName, service) => {
    if (service.isQueueAsserted(routeName)) {
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

    service.setQueueAsserted(routeName);

    return assertedQueue;
  },
  replyQueue: async (channel, routeName) => {
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
};
