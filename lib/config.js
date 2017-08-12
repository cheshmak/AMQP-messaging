'use strict';
module.exports = {
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
};
