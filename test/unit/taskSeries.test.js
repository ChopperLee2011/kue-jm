'use strict';
const expect = require('expect');
const JM = require('../../lib/jobManager');
const taskSeries = require('../../lib/taskSeries');

describe('Task series', () => {
  let jm;
  let series;
  let config = {
    redisSentinelForJQ: '127.0.0.1:26379',
    redisSentinelNameForJQ: 'jobqueue01',
    redisDBForJQ: 0,
    redisDBForSubJob: 1
  };

  before(() => {
    //todo: mock this.
    jm = new JM(config);
    series = new taskSeries();
  });

  describe('#EXECUTETASKS', () => {
    const tasks = [
      {
        name: 'ipsum',
        ttl: 5000,
        retry: 4,
        path: '../test/fixture/task1',
        param: { foo: 'bar' }
      },
      {
        name: 'lorem',
        ttl: 10000,
        retry: 5,
        path: '../test/fixture/task2',
        param: { baz: 'qux' }
      }];

    beforeEach(done => {
      jm.job._db.flushdb(()=> {
        done();
      });
    });

    it('should execute the tasks sequentially', done => {
      series.executeTasks(jm, tasks)
        .then(res => {
          expect(res).toEqual('barqux');
          done();
        });
    });

    it('should record complete status and the result', done => {
      tasks.push({
        name: 'lorem',
        path: '../test/fixture/non-exist',
        param: { baz: 'qux' }
      });
      series.executeTasks(jm, tasks)
        .catch(err => {
          expect(err).toExist();
          jm.job._db.keys('*:?', (err, replies) => {
            expect(replies.length).toEqual(3);
            let t1 = replies.find(reply => {
              return (/.*:0$/.test(reply));
            });
            jm.job._db.hgetall(t1, (err, t) => {
              expect(t.name).toEqual('ipsum');
              expect(t.param).toEqual('{"foo":"bar"}');
              expect(t.result).toEqual('bar');
              expect(t.status).toEqual('complete');
              done();
            });
          });
        });
    });
  });
});