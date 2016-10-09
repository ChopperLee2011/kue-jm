'use strict';

const expect = require('expect');
const sinon = require('sinon');
const uuid = require('node-uuid');
const Redis = require('ioredis');
const delay = require('delay');
const util = require('../../lib/util');
const JM = require('../../lib/jobManager');
const Series = require('../../lib/taskSeries');
const config = require('../config');

describe('Task series', () => {
  let jm;
  let series;

  before(() => {
    // todo: mock this.
    jm = new JM(config);
    series = new Series();
  });

  describe('#EXECUTETASKS', () => {
    let tasks = [];
    let sandbox;
    let sid;
    let i = 0;
    const redis = new Redis(
      {
        port: 6379,          // Redis port
        host: '127.0.0.1',   // Redis host
        db: 1,
      }
    );

    beforeEach(() => {
      series.compensateTasks.length = 0;
      tasks = [
        {
          name: 'ipsum',
          ttl: 5000,
          retry: 4,
          path: '../test/fixture/task1',
          param: { foo: 'bar' },
        },
        {
          name: 'lorem',
          ttl: 10000,
          retry: 5,
          path: '../test/fixture/task2',
          param: { baz: 'qux' },
        }];
      sandbox = sinon.sandbox.create();
      sandbox.stub(Series.prototype, 'execute').returns(Promise.resolve(true));
      const jobType = `EXECUTETASKS ${i}`;
      sid = uuid.v4();
      return jm.addJob(jobType, { id: sid })
        .then(() => {
          jm.addTasks(jobType, tasks);
          return jm.run(jobType);
        })
        .then(() => {
          i++;
          return sandbox.restore();
        })
        .catch(() => sandbox.restore());
    });

    after(() => jm.job._db.flushdb());

    it('should execute the tasks sequentially', () => {
      return series.execute(jm, sid, tasks)
        .then(res => expect(res).toEqual('barqux'));
    });

    it('should record complete status and the result when job success', () => {
      return series.execute(jm, sid, tasks)
        .catch((err) => {
          expect(err).toExist();
          jm.job._db.keys('*:?', (err, replies) => {
            expect(replies.length).toEqual(2);
            const t1 = replies.find(reply => (/.*:0$/.test(reply)));
            jm.job._db.hgetall(t1, (err, t) => {
              expect(t.name).toEqual('ipsum');
              expect(t.param).toEqual('{"foo":"bar"}');
              expect(t.result).toEqual('bar');
              expect(t.status).toEqual('complete');
            });
          });
        });
    });

    it('should record complete status and the result when job fail', () => {
      tasks.push({
        name: 'lorem',
        path: '../test/fixture/failTask',
        param: { baz: 'qux' },
        idx: 2,
      });
      return redis.hmset(`${sid}:2`, util.serialize(tasks[2]))
        .then(() => series.execute(jm, sid, tasks))
        .catch((err) => {
          expect(err).toExist();
          jm.job._db.keys('*:?', (err, replies) => {
            expect(replies.length).toEqual(3);
            const t1 = replies.find(reply => (/.*:0$/.test(reply)));
            jm.job._db.hgetall(t1, (err, t) => {
              expect(t.name).toEqual('ipsum');
              expect(t.param).toEqual('{"foo":"bar"}');
              expect(t.result).toEqual('bar');
              expect(t.status).toEqual('complete');
            });
          });
        });
    });

    it('should stop execute when one of the task is failure', () => {
      tasks.concat([
        {
          name: 'failure1',
          ttl: 5000,
          retry: 4,
          path: '../test/fixture/failTask',
          param: { foo: 'bar' },
          idx: 2,
          rewind: {
            path: '../test/fixture/rewindTask',
          },
        },
        {
          name: 'lorem',
          ttl: 10000,
          retry: 5,
          path: '../test/fixture/task2',
          param: { baz: 'qux' },
          idx: 3,
        },
      ]);
      return redis.hmset(`${sid}:2`, util.serialize(tasks[2]))
        .then(() => redis.hmset(`${sid}:3`, util.serialize(tasks[3])))
        .then(() => series.execute(jm, sid, tasks))
        .catch((err) => {
          expect(err).toExist();
        });
    });

    it('should execute rewind tasks when some error happened', () => {
      tasks.push(
        {
          name: 'failure1',
          ttl: 5000,
          retry: 4,
          path: '../test/fixture/failTask',
          param: { foo: 'bar' },
          idx: 2,
          rewindPath: '../test/fixture/rewindTask',
        }
      );
      const spy = sinon.spy(jm, 'sortTasks');
      return redis.hmset(`${sid}:2`, util.serialize(tasks[2]))
        .then(() => series.execute(jm, sid, tasks))
        .catch((err) => {
          expect(err).toExist();
          spy.withArgs('chain', sid, series.compensateTasks);
          return delay(500);
        })
        .then(() => {
          expect(series.compensateTasks.length).toEqual(1);
          expect(spy.called).toEqual(true);
          spy.reset();
          spy.restore();
        })
        .catch(err => console.log(err));
    });

    it('should execute rewind tasks sequentially when some error happened', () => {
      tasks = tasks.concat([
        {
          name: 'ipsum',
          ttl: 5000,
          retry: 4,
          path: '../test/fixture/task1',
          param: { foo: 'bar' },
          idx: 2,
          rewindPath: '../test/fixture/rewindTask1',
        },
        {
          name: 'lorem',
          ttl: 10000,
          retry: 5,
          path: '../test/fixture/task2',
          param: { baz: 'qux' },
          idx: 3,
          rewindPath: '../test/fixture/rewindTask2',
        },
        {
          name: 'failure1',
          ttl: 5000,
          retry: 4,
          path: '../test/fixture/failTask',
          param: { foo: 'bar' },
          idx: 4,
          rewindPath: '../test/fixture/rewindTask',
        },
      ]);
      const spy = sinon.spy(jm, 'sortTasks');
      const addTasks = [];
      tasks.forEach((task, i) => {
        if (i > 1)
          addTasks.push(redis.hmset(`${sid}:${i}`, util.serialize(task)));
      });
      return Promise.all(addTasks)
        .then(() => series.execute(jm, sid, tasks))
        .catch((err) => {
          expect(err).toExist();
          spy.withArgs('chain', sid, series.compensateTasks);
          return delay(500);
        })
        .then(() => {
          expect(series.compensateTasks.length).toEqual(3);
          expect(spy.called).toEqual(true);
          spy.reset();
          spy.restore();
        });
    });
  });
});
