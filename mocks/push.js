'use strict';

const Q = require('q');

function Push(data) {
  this._data = data;
}
Push.prototype.sendPush = function () {
  return Q.resolve();
};
Push.prototype.rpcCall = function () {
  return Q.resolve(this._data);
};
module.exports = Push;
