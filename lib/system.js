'use strict';

const
  devMode = (process.env.NODE_ENV !== 'production'),
  amqplib = require('amqp-connection-manager'),
  logger = require('ches-logger'),
  _ = require('lodash');

const _connection = Symbol('connection');

class System {
  constructor() {
    this[_connection] = null;
  }

  get connection() {
    return this[_connection];
  }

  assertConnection(onConnect, onDisconnect) {
    if (this.connection) {
      return Promise.resolve(this.connection);
    }

    const amqpAddress = devMode ? 'localhost' : process.env.AMQP_SERVER_ADDRESS;

    if (!_.isString(amqpAddress)) {
      throw new Error('AMQP_SERVER_ADDRESS');
    }

    this[_connection] = amqplib.connect(`amqp://${amqpAddress}`);

    this.connection.on('error', (err) => {
      logger.log('error', 'rabbitmq connection error', {
        err
      });
    });

    this.connection.on('connect', () => {
      if (_.isFunction(onConnect)) {
        try {
          onConnect();
        } catch (err) {
          logger.log('error', 'on connect event callback has an error', {
            err
          });
        }
      }
      logger.log('verbose', 'Connect to AMQP server successfully');
    });

    this.connection.on('disconnect', (err) => {
      if (_.isFunction(onDisconnect)) {
        try {
          onDisconnect();
        } catch (err) {
          logger.log('error', 'on disconnect event callback has an error', {
            err
          });
        }
      }
      logger.log('error', 'FATAL:: amqp is disconnected, trying to reconnect', {
        err
      });
    });

    return Promise.resolve(this.connection);
  }

  closeConnection() {
    if (!_.isNil(this.connection)) {
      this.connection.close();
      this[_connection] = null;
    }
    return true;
  }
}

module.exports = new System();
