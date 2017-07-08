'use strict';
const config = require('./config'),
  _ = require('lodash'),
  Q = require('q');

module.exports = {
  workerQueue: (channel, routeName) => {
    const timeToLive = _.get(config[routeName], 'timeToLive');

    const queueConfig = {
      durable: true
    };

    if (timeToLive > 0) {
      queueConfig.messageTtl = timeToLive;
    }
    return Q(channel.assertQueue(routeName, queueConfig));
  },
  replyQueue: (channel, routeName) => {
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
    return Q(channel.assertQueue('', queueConfig));
  }
};
