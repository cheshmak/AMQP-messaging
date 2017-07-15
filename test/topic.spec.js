'use strict';
const
  topic = require('../lib/topic'),
  Q = require('q'),
  chai = require('chai'),
  expect = chai.expect,
  cmd = require('node-cmd');

chai.use(require('chai-as-promised'));

const ex1 = 'exchangetest1',
  ex2 = 'exchangetest2';

describe('Publish/Subscribe', function () {
  const deleteTestsLists = () => {
    cmd.run(`rabbitmqadmin delete exchange name=${ex1}`);
    cmd.run(`rabbitmqadmin delete exchange name=${ex2}`);
  };

  beforeEach((done) => {
    Q.fcall(() => {
      deleteTestsLists();
    }).then(() => {
      setTimeout(() => {
        done();
      }, 200);
    });
  });

  it('Should subscribe and publish correctly with one subscriber', () => {
    const
      defer = Q.defer(),
      sampleMsg = {
        name: 'test content'
      };

    topic.subscribe(ex1, (res) => {
      try {
        expect(res).to.be.deep.equal(sampleMsg);
        defer.resolve();
      } catch (err) {
        defer.reject(err);
      }
    }).then(() => {
      topic.publish(ex1, sampleMsg);
    });

    return defer.promise;
  });

  it('Should subscribe and publish correctly with more than one subscribers', () => {
    const sampleMsg = {
        name: 'test content',
        buf: new Buffer('Test data for buffer')
      },
      defer1 = Q.defer(),
      defer2 = Q.defer();

    topic.subscribe(ex2, (res) => {
      try {
        expect(res).to.be.deep.equal(sampleMsg);
        defer1.resolve();
      } catch (err) {
        defer1.reject(err);
      }
    }).then(() => {
      return topic.subscribe(ex2, (res) => {
        try {
          expect(res).to.be.deep.equal(sampleMsg);
          defer2.resolve();
        } catch (err) {
          defer2.reject(err);
        }
      });
    }).then(() => {
      topic.publish(ex1, sampleMsg);
      topic.publish(ex2, sampleMsg);
    });

    return Q.all([defer1.promise, defer2.promise]);
  });

  it('Should not getting message on publish before subscribing', function () {
    this.timeout(10000);
    const defer = Q.defer();

    topic.publish(ex1, {})
      .then(() => {
        setTimeout(() => {
          defer.resolve();
        }, 7000);
        return topic.subscribe(ex1, () => {
          defer.reject();
        });
      });

    return defer.promise;
  });

  it('Should get error on invalid params for publish', function (done) {
    const defer1 = Q.defer(),
      defer2 = Q.defer();

    topic.publish()
      .then(() => {
        defer1.reject();
      })
      .catch((err) => {
        defer1.resolve(err);
      });

    topic.publish(ex1)
      .then(() => {
        defer2.reject();
      })
      .catch((err) => {
        defer2.resolve(err);
      });

    Q.all([defer1.promise, defer2.promise]).done(() => done());
  });

  it('Should get error on invalid params for subscribe', function () {
    expect(topic.subscribe()).be.rejected;
  });

  it('Should invalid consumer function passed', function () {
    this.timeout(4000);
    const
      defer = Q.defer(),
      sampleMsg = {
        name: 'test content'
      };

    /* eslint
     no-unused-vars: ["off"]
     no-undef: ["off"]
     */
    topic.subscribe(ex1, (res) => {
      setTimeout(() => {
        defer.resolve();
      }, 2000);
      const fun = 0;
      func(res);
    }).then(() => {
      topic.publish(ex1, sampleMsg);
    });

    return defer.promise;
  });
});
