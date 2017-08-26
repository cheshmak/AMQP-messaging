'use strict';

const
  devMode = (process.env.NODE_ENV !== 'production'),
  amqplib = require('amqp-connection-manager'),
  Exception = require('ches-exception'),
  logger = require('ches-logger'),
  Q = require('q'),
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
    if (!this.connection) {
      if (!devMode) {
        if (!_.isString(process.env.AMQP_SERVER_ADDRESS)) {
          throw new Exception('NOT_FOUND', new Error('AMQP_SERVER_ADDRESS'));
        }
      }
      this[_connection] = amqplib.connect(`amqp://${devMode ? 'localhost' : process.env.AMQP_SERVER_ADDRESS}`);
  
      this.connection.on('error', (err) => {
        logger.log('error', 'rabbitmq connection error', {
          err: err
        });
      });
      
      this.connection.on('connect', () => {
        if (_.isFunction(onConnect)) {
          try {
            onConnect();
          } catch (err) {
            logger.log('error', 'on connect event callback has an error');
          }
        }
        logger.log('verbose', 'Connect to AMQP server successfully');
      });

      this.connection.on('disconnect', () => {
        if (_.isFunction(onDisconnect)) {
          try {
            onDisconnect();
          } catch (err) {
            logger.log('error', 'on disconnect event callback has an error');
          }
        }
        logger.log('error', 'FATAL:: amqp is disconnected, trying to reconnect');
      });
    }
    return Q.resolve(this.connection);
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
