'use strict';

module.exports = (dataToReturn) => {
  return {
    push: require('./push'),
    service: require('./service')(dataToReturn)
  };
};
