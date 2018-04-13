'use strict';
const amqplib = require('amqplib'),
  logger = require('ches-logger'),
  amqpAddress = require('./config').AMQP_SERVER_ADDRESS,
  connection = Symbol('connection'),
  channel = Symbol('channel'),
  called = Symbol('called'),
  connectionError = Symbol('connectionError');

let connectionCallback = (err) => {
  logger.log('error', 'error on rabbit connection. going to exit', {
    err
  });
  setTimeout(() => {
    process.exit(1);
  }, 3000);
  return new Error('error on rabbit' + err);
};
class Channel {
  constructor() {
    this[called] = false;
  }
  [connectionError](err) {
    if (!this[called]) {
      connectionCallback(err);
      this[called] = true;
    }
  }
  async getChannel() {
    const self = this;
    try {
      if (!self[connection]) {
        self[connection] = await amqplib.connect(`amqp://${amqpAddress}`);
        self[connection].on('error', (err) => {
          logger.log('error', 'rabbitmq connection error', {
            err
          });
          self[connectionError](err);
        });
        self[connection].on('close', () => {
          logger.log('error', 'rabbitmq connection closed');
          self[connectionError]();
        });
      }
      if (!self[channel]) {
        self[channel] = await this[connection].createChannel();
        self[channel].on('close', () => {
          logger.log('error', 'rabbitmq channel is closed');
          self[connectionError]();
        });
        self[channel].on('error', (err) => {
          logger.log('error', 'rabbitmq channel error', {
            err
          });
          self[connectionError](err);
        });
      }
      return self[channel];
    } catch (err) {
      logger.log('error', 'error on rabbit connect', {
        err
      });
      return self[connectionError](err);
    }
  }
  setOnError(callback) {
    connectionCallback = callback;
  }
}
module.exports = new Channel();
