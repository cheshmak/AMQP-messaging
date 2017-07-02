'use strict';

const
  chai = require('chai'),
  expect = chai.expect,
  Q = require('q'),
  system = require('../lib/system'),
  amqp = require('amqp-connection-manager');


describe('System Class', function () {
  it('Should work correctly', () => {
    return system.assertConnection()
      .then((cn) => {
        expect(cn).to.be.an('object');
        return Q.resolve();
      });
  });

  it('Should work correctly with invalid callbacks', function (done) {
    this.timeout(7000);
    /* eslint
     no-unused-vars: ["off"]
     no-undef: ["off"]
     */
    const invalidFunc = () => {
      sample();
    };
    system.assertConnection(invalidFunc, invalidFunc)
      .then((cn) => {
        cn.close();
      });
    setTimeout(() => {
      done();
    }, 4000);
  });

  it('Close connection should work correctly', function () {
    system.assertConnection().then((cn) => {
      expect(cn).to.be.an('object');
      expect(system.closeConnection()).to.be.ok;
      expect(system.connection).to.be.null;
    });
  });
});
