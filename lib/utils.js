'use strict';
module.exports = {
  /**
   * Reference: https://medium.com/@95yashsharma/polyfill-for-promise-allsettled-965f9f2a003
   * @param promises
   * @return {Promise<unknown[]>|Promise<{[p: string]: PromiseSettledResult<*>}>}
   */
  promiseAllSettled: (promises) => {
    if (Promise.allSettled) { // Nodejs prior to 12.09 doesn't have this function
      return Promise.allSettled(promises);
    }
    const mappedPromises = promises.map((p) => {
      return p
        .then((value) => {
          return {
            status: 'fulfilled',
            value
          };
        })
        .catch((reason) => {
          return {
            status: 'rejected',
            reason
          };
        });
    });
    return Promise.all(mappedPromises);
  }
};
