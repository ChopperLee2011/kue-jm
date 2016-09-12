'use strict';

const uuid = require('node-uuid');
const JM = require('./jobManager');
const _ = require('lodash');
const debug = require('debug')('jm:lib:taskSeries');

class taskSeries {
  constructor() {
    this.sid = `s:${uuid.v4()}`;
  }

  /**
   * execute tasks
   * @param {jobManager} jm
   * @param {...task} tasks
   * @return
   */
  executeTasks(jm, tasks) {
    debug('executeTasks tasks: %o', tasks);
    return new Promise((resolve, reject) => {

      // if (!(jm instanceof JM)) {
      //   return reject(new Error('jm should be instance of JobManager'))
      // }
      if (!(tasks instanceof Array)) {
        return reject(new Error('No task to be executed.'));
      }
      if (tasks.length === 0) {
        return resolve({});
      }

      let multi = jm.job._db.multi();
      tasks.forEach((task, i) => {
        tasks[i].idx = i;
        multi.hmset(`${this.sid}:${i}`, this.serialize(task))
      });
      multi.exec()
        .then(() => {
          jm.task._queue.process(this.sid, (job, done) => {
            debug('executeTasks process job.data: %o', job.data);
            if (job.data.status === 'complete' && job.data.result) {
              return done(null, job.data.result);
            }
            try {
              let mod = require(job.data.path);
              let input = job.data.preResult;
              mod(job.data.param, input, done);
            } catch (e) {
              done(e);
            }
          });
          return this.createStep(jm, tasks[0], (err, res) => {
            if (err)
              return reject(err);
            resolve(res);
          });
        });
    });
  }

  /**
   * create steps
   * @param {jobManager} jm
   * @param {task} task
   * @param {callback] cb
   * @return
   */

  createStep(jm, task, cb) {
    const job = jm.task._queue
      .create(this.sid, task)
      .removeOnComplete(true)
      .attempts(task.retry)
      .ttl(task.ttl);
    job
      .on('complete', result => {
        debug('createStep complete result: %o', result);
        jm.job._db
          .multi([
            ['hset', `${this.sid}:${task.idx}`, 'status', 'complete'],
            ['hset', `${this.sid}:${task.idx}`, 'result', result]
          ])
          .exec()
          .then(() => {
            return this.next(jm, task.idx);
          })
          .then(nextTask => {
            if (nextTask.idx) {
              nextTask.preResult = result;
              return this.createStep(jm, nextTask, cb);
            } else {
              for (var i = task.idx; i >= 0; i--) {
                jm.job._db.del(`${this.sid}:${i}`);
              }
              debug('createStep return result: %o', result);
              cb(null, result);
            }
          })
          .catch(err => cb(err, null));
      })
      .on('failed', errMessage => {
        return cb(errMessage, null);
      })
      .save(err => {
        if (err)
          return cb(err, null);
      });
  }

  /**
   * next step
   * @param
   * @return
   */
  next(jm, curIdx) {
    debug('next curIdx: %d', curIdx);
    return new Promise((resolve, reject) => {
      jm.job._db.hgetall(`${this.sid}:${++curIdx}`)
        .then(task => {
          resolve(this.deserialize(task));
        })
        .catch(err => reject(err));
    });
  }

  /**
   * serialize task
   * @param {Object} task
   * @return
   */
  serialize(json) {
    return _.mapValues(json, (v) => {
      return _.isObject(v) ? JSON.stringify(v) : v;
    });
  };

  deserialize(flatTask) {
    let result = _.mapValues(flatTask, (v, k) => {
      if (k === 'param' || k === 'result') {
        return JSON.parse(v);
      }
      return v;
    });
    return result;
  }
}

module.exports = taskSeries;
