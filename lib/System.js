'use strict';

const
  devMode = (process.env.NODE_ENV !== 'production'),
  amqplib = require('amqp-connection-manager'),
  Exception = require('ches-exception'),
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
    if(!this.connection) {
      if (!devMode) {
        if (!_.isString(process.env.AMQP_SERVER_ADDRESS)) {
          throw new Exception('NOT_FOUND', new Error('AMQP_SERVER_ADDRESS'));
        }
      }
      this[_connection] = amqplib.connect(`amqp://${devMode ? 'localhost' : process.env.AMQP_SERVER_ADDRESS}`);

      this.connection.on('disconnect', () => {
        if(_.isFunction(onDisconnect)) {
          onDisconnect();
        }
        console.error('FATAL:: amqp is disconnected, trying to reconnect');
      });

      this.connection.on('connect', () => {
        if(_.isFunction(onConnect)) {
          onConnect();
        }
        console.log('success connect to amqp');
      });
    }
    return Q.resolve(this.connection);
  }
}

module.exports = new System();
