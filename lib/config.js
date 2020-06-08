'use strict';
module.exports = {
  AMQP_SERVER_ADDRESS: process.env.AMQP_SERVER_ADDRESS || 'localhost',
  PACK_QUEUE_LIMITATION: parseInt(process.env.PACK_QUEUE_LIMITATION, 0) || 10,
  PACK_QUEUE_INTERVAL: parseInt(process.env.PACK_QUEUE_INTERVAL, 0) || 500,
  SEND_IMMEDIATE_DEFAULT: process.env.SEND_IMMEDIATE_DEFAULT || true,
  queue: {
    'cheshmak:sdk-server:initiate': {
      timeToLive: 7000
    },

    'cheshmak:sendPushService': { // 3 minutes according to GCM sendNoRetry˚
      timeToLive: 180000
    },

    'messagingtest4': { // This is for unit test
      timeToLive: 100
    }
  }
};
