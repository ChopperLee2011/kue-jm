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
      it('should return an instance in promise', () => {
        return jm.addJob('foo', { id: uuid.v4() })
          .then(res => {
            expect(res.id).toBeA('number');
            expect(res.type).toEqual('foo');
            expect(res).toEqual(jm.job.instance);
          })
      });
    });

  });

  describe('#START ', () => {
    const tasks = [
      {
        name: 'ipsum',
        ttl: 5000,
        retry: 4,
        path: '../test/fixture/task1',
        param: { foo: 'bar' }
      }
    ];
    before(() => {
      return jm.addJob('foo', { id: uuid.v4() })
        .then(() => jm.addTasks('foo', tasks))
    });

    it('should return process result', () => {
      return jm.start('foo')
        .then(res => {
          expect(res).toBeA('string');
          expect(res).toEqual('bar');
        });
    });
  });

  describe('#ADDTASKS', () => {

    it('should add tasks to the JM ', () => {
      const tasks = [{ name: 'task1' }];
      return jm.addJob('ADDTASKS1', { id: uuid.v4() })
        .then(() => jm.addTasks('ADDTASKS1', tasks))
        .then(() => {
          expect(jm.task.collections.get('ADDTASKS1')).toEqual(tasks);
        });
    });
  })

});