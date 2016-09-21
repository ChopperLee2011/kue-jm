'use strict';

const expect = require('expect');
const uuid = require('node-uuid');
const delay = require('delay');
const sinon = require('sinon');
const JM = require('../../lib/jobManager');
const config = require('../config');

describe('Integration', () => {
  it('execute tasks sequentially for on job type', () => {
    const jm = new JM(config);
    const uid = uuid.v4();
    const jobType = 'integratoin';
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

    return jm.addJob(jobType, { id: uid })
      .then(() => {
        jm.addTasks(jobType, tasks);
        return jm.run(jobType);
      })
      .then(res => {
        expect(res).toEqual(uid);
        return delay(1000);
      })
      .then(() => {
        return jm.job._db.get(`${jobType}:id:${uid}`)
      })
      .then(val => {
        expect(val).toEqual('barqux');
      })
  });
});