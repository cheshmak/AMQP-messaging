'use strict';

const
  system = require('./system'),
  pushProvider = require('./push'),
  logger = require('ches-logger'),
  assertQueue = require('./assertQueue'),
  _ = require('lodash'),
  BSON = require('bson'),
  _assertedQueues = Symbol('assertedQueues'),
  _confirmChannel = Symbol('confirmChannel'),
  _channelWrapper = Symbol('channelWrapper'),
  _createNewChannel = Symbol('createNewChannel');

class service {
  constructor() {
    const self = this;

    if (!system.connection) {
      return (async () => {
        await system.assertConnection();
        return self;
      })();
    }

    return Promise.resolve(self);
  }

  getPushProvider(routeName) {
    return new pushProvider(routeName, system.connection, service);
  }

  async addWorker(routeName, workerFunction, options) {
    await service.getChannelWrapper();
    const channel = service.getChannel();
    await assertQueue.workerQueue(channel, routeName, service);

    const bson = new BSON();

    channel.prefetch(_.get(options, 'prefetchCount', 1));
    channel.consume(routeName, async (msg) => {
      let parsed;
      try {
        parsed = bson.deserialize(msg.content, {
          promoteBuffers: true
        });
      } catch (e) {
        logger.log('error', 'messaging:error parsing input queue', {
          routeName: routeName,
          error: e,
          incomingmsg: msg
        });
      }

      if (!parsed) {
        channel.ack(msg); // don't call workerFunction  but call ack for next incomming data
        return true;
      }

      let response;

      try {
        const result = await workerFunction(parsed);
        response = {
          success: true,
          result
        };
      } catch (result) {
        logger.log('error', 'error in service ', {
          routeName: routeName,
          incommingData: msg.content.toString(),
          result
        });

        response = {
          success: false,
          result
        };
      }

      const replyTo = _.get(msg, 'properties.replyTo', false);
      if (replyTo) {
        await channel.sendToQueue(replyTo, bson.serialize(response), {
          correlationId: msg.properties.correlationId
        });
      }

      channel.ack(msg);
    }, {
      consumerTag: routeName
    });

    logger.log('verbose', `messaging:worker for queue: ${routeName} added, waiting for incoming queue`);
  }

  async cancelWorker(routeName) {
    await service.getChannelWrapper();
    const channel = service.getChannel();
    let consumers = [];

    if (routeName) {
      consumers = [routeName];
    } else {
      consumers = _.keys(channel.consumers);
    }

    for (const routeName of consumers) {
      await channel.cancel(routeName);
      logger.log('verbose', `messaging:worker for queue: ${routeName} canceled.`);
    }
  }
}

service[_channelWrapper] = null;
service[_confirmChannel] = null;
service[_assertedQueues] = {};

service[_createNewChannel] = () => {
  service[_channelWrapper] = new Promise((resolve) => {
    if (service[_confirmChannel]) {
      return resolve(service[_confirmChannel]);
    }

    system.connection.createChannel({
      setup: (channel) => {
        logger.log('debug', 'A new channel is going to create...');
        channel.on('close', () => {
          service[_confirmChannel] = null;
          _.each(service[_assertedQueues], (value, key) => {
            delete service[_assertedQueues][key];
          });
          logger.log('verbose', 'Old channel is closed');
        });
        logger.log('verbose', 'A new channel has been created');
        service[_confirmChannel] = channel;
        resolve(service[_confirmChannel]);
      }
    });
  });
};

service.getChannel = function () {
  return service[_confirmChannel];
};

service.getChannelWrapper = async () => {
  if (service[_channelWrapper]) {
    return await service[_channelWrapper];
  }

  service[_createNewChannel]();
  return await service[_channelWrapper];
};

service.isQueueAsserted = (queue) => {
  if (_.has(service[_assertedQueues], queue)) {
    return service[_assertedQueues][queue];
  }
  return false;
};

service.setQueueAsserted = (queue) => {
  service[_assertedQueues][queue] = true;
};

module.exports = service;
