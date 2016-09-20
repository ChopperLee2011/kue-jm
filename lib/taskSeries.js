'use strict';

const uuid = require('node-uuid');
const util = require('./util');
const debug = require('debug')('jm:lib:taskSeries');

class taskSeries {
  constructor() {
    this.sid;
    this.compensateTasks = [];
  }

  /**
   * execute tasks
   * @param {jobManager} jm
   * @param {string} job unique id
   * @param {...tasks} task list
   * @param {object} options
   * @return
   */
  execute(jm, sid, tasks, opt) {
    opt = opt || {};
    debug('execute tasks sid: %s \t tasks: %o \t opt: %o', sid, tasks, opt);
    this.sid = sid;
    return new Promise((resolve, reject) => {
      if (!(tasks instanceof Array)) {
        return reject(new Error('No task to be executed.'));
      }
      if (tasks.length === 0) {
        return resolve({});
      }

      jm.task._queue.process(this.sid, (job, done) => {
        debug('executeTasks process job.data: %o', job.data);
        if (job.data.status === 'complete' && job.data.result) {
          debug('executeTasks get an complete job with data: %o', job.data.result);
          return done(null, job.data.result);
        }
        try {
          let mod;
          opt.rewind
            ? mod = require(job.data.rewind.path)
            : mod = require(job.data.path);
          let input = job.data.preResult;
          mod(job.data.param, input, (err, res) => {
            if (err) {
              for (let i = Number(job.data.idx); i >= 0; i--) {
                if (tasks[i].rewind)
                  this.compensateTasks.push(tasks[i]);
              }
              if (this.compensateTasks.length > 0)
              //async call
                this.execute(jm, this.compensateTasks, { rewind: true, preResult: res, err });
              done(err);
            } else {
              done(null, res);
            }
          });
        } catch (e) {
          done(e);
        }
      });

      return this.createStep(jm, sid, tasks[0], (err, res) => {
        if (err)
          return reject(err);
        resolve(res);
      });
    });
  }

  // rewind(jm, tasks) {
  //   debug('rewind tasks: %o', tasks);
  //   return new Promise((resolve, reject) => {
  //     if (!(tasks instanceof Array)) {
  //       return reject(new Error('No task to be executed.'));
  //     }
  //     if (tasks.length === 0) {
  //       return resolve({});
  //     }
  //   });
  // }

  /**
   * create steps
   * @param {jobManager} jm
   * @param {task} task
   * @param {callback] cb
   * @return
   */

  createStep(jm, sid, task, cb) {
    const job = jm.task._queue
      .create(this.sid, task)
      .removeOnComplete(!jm.debug)
      .attempts(task.retry)
      .ttl(task.ttl);
    job
      .on('complete', result => {
        debug('createStep complete result: %o', result);
        jm.job._db
          .multi([
            ['hset', `${sid}:${task.idx}`, 'status', 'complete'],
            ['hset', `${sid}:${task.idx}`, 'result', result]
          ])
          .exec()
          .then(() => {
            return this.next(jm, sid, task.idx);
          })
          .then(nextTask => {
            if (nextTask.idx) {
              nextTask.preResult = result;
              return this.createStep(jm, sid, nextTask, cb);
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
        return cb(new Error(errMessage), null);
      })
      .save(err => {
        if (err)
          return cb(err, null);
      });
  }

  /**
   * next step
   * @param {jobmanager} jm
   * @param {sid} job unique id
   * @param {curIdx} current step id
   * @return
   */
  next(jm, sid, curIdx) {
    debug('next curIdx: %d', curIdx);
    return new Promise((resolve, reject) => {
      jm.job._db.hgetall(`${sid}:${++curIdx}`)
        .then(task => {
          resolve(util.deserialize(task));
        })
        .catch(err => reject(err));
    });
  }
}

module.exports = taskSeries;
