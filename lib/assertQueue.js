'use strict';
const config = require('./config'),
  _ = require('lodash'),
  Q = require('q');
module.exports = {
  workerQueue: (channel, routeName) => {
    let timeToLive = _.get(config[routeName], 'timeToLive');
    let queueConfig = {
      durable: true
    };
    if (timeToLive > 0) {
      queueConfig.messageTtl = timeToLive;
    }
    return Q(channel.assertQueue(routeName, queueConfig));
  },
  replyQueue: (channel, routeName) => {
    let timeToLive = _.get(config[routeName], 'timeToLive');
    let queueConfig = {
      durable: true,
      exclusive: true,
      autoDelete: true
    };
    if (timeToLive > 0) {
      queueConfig.messageTtl = timeToLive;
    }
    return Q(channel.assertQueue('', queueConfig));
  }



};
