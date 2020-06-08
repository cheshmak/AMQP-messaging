'use strict';
const notepack = require('notepack.io'),
  zlib = require('zlib');


class Serializer {
  static async serializeJsonObject(object) {
    if (Buffer.isBuffer(object)) {
      return object;
    }
    return new Promise((resolve, reject) => {
      zlib.gzip(notepack.encode(object), (error, result) => {
        if (error) {
          return reject(error);
        }
        return resolve(result);
      });
    });
  }

  static async deserializeBufferToJsonObject(buffer) {
    return new Promise((resolve, reject) => {
      zlib.gunzip(buffer, (error, result) => {
        if (error) {
          return reject(error);
        }
        return resolve(notepack.decode(result));
      });
    });
  }
}

module.exports = Serializer;
