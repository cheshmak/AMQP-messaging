'use strict';
module.exports = {
  AMQP_SERVER_ADDRESS: process.env.AMQP_SERVER_ADDRESS || 'localhost',
  queue: {
    'cheshmak:sdk-server:initiate': {
      timeToLive: 7000,
      replyExpires: 7000
    },

    'cheshmak:sendPushService': { // 3 minutes according to GCM sendNoRetry˚
      timeToLive: 180000,
      replyExpires: 180000
    },

    'messagingtest4': { // This is for unit test
      timeToLive: 100
    }
  }
};
