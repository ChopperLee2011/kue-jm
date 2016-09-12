'use strict';

const expect = require('expect');
const uuid = require('node-uuid');
// const testQ = require('kue').createQueue();
const JM = require('../../lib/jobManager');

describe('Job Manager', () => {
  let jm;
  let config = {
    redisSentinelForJQ: '127.0.0.1:26379',
    redisSentinelNameForJQ: 'jobqueue01',
    redisDBForJQ: 0,
    redisDBForSubJob: 1
  };

  before(() => {
    jm = new JM(config);
    expect(jm.job).toBeAn('object');
    expect(jm.task._queue).toBeAn('object');
    // testQ.testMode.enter();
    // jm.task._queue = testQ;
  });

  // afterEach(() => {
  //   testQ.testMode.clear();
  // });
  //
  // after(() => {
  //   testQ.testMode.exit();
  // });

  describe('#ADDJOB ', () => {

    after(done => {
      jm.job._db.flushdb(()=> {
        done();
      });
    });

    describe('with options', () => {
      it('should return an instance in promise', done => {
        jm.addJob('foo', { id: uuid.v4() })
          .then(res => {
            expect(res.id).toBeA('number');
            expect(res.type).toEqual('foo');
            expect(res).toEqual(jm.job.instance);
            done();
          })
      });
    });

  });

  describe('#START ', () => {
    before(done => {
      jm.addJob('foo', { id: uuid.v4() })
        .then(() => done());
    });

    it('should return process result', done => {
      jm.start('foo')
        .then(res => {
          expect(res).toBeAn('object');
          done();
        });
    });
  });


});