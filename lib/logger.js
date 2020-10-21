'use strict';

class Logger {
  log(level, msg, data) {
    if (this._logger) {
      try {
        this._logger(level, msg, data);
      } catch (e) {
        console.log('error in logger', e);
      }
    } else {
      console.log(`${level}: ${msg}: `, data);
    }
  }
  setLogger(logger) {
    this._logger = logger;
  }
}
module.exports = new Logger();
