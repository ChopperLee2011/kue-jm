'use strict';

const util = require('./util');
const debug = require('debug')('jm:lib:taskSeries');

class taskSeries {
  constructor() {
    this.sid = '';
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
      if (!(tasks instanceof Array))
        return reject(new Error('No task to be executed.'));
      if (tasks.length === 0)
        return resolve({});
      jm.task._queue.process(sid, (job, done) => {
        debug('executeTasks process job.data: %o', job.data);
        if (job.data.status === 'complete' && job.data.result) {
          debug('executeTasks get an complete job with data: %o', job.data.result);
          return done(null, job.data.result);
        }
        try {
          let mod;
          opt.rewind === true
            ? mod = require(job.data.rewindPath)
            : mod = require(job.data.path);
          const input = job.data.preResult;
          mod(job.data.param, input, (err, res) => {
            if (err) {
              for (let i = Number(job.data.idx); i >= 0; i--)
                if (tasks[i] && tasks[i].rewindPath)
                  this.compensateTasks.push(tasks[i]);
              if (this.compensateTasks.length > 0)
              // async call
                jm.sortTasks('chain', sid, this.compensateTasks)
                  .then(() => this.execute(jm, sid, this.compensateTasks,
                    { rewind: true, preResult: res, err }));
              done(err);
            } else
              done(null, res);
          });
        } catch (e) {
          done(e);
        }
      });
      return this.createStep(jm, sid, tasks[0])
        .then(res => resolve(res))
        .catch(err => reject(err));
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

  createStep(jm, sid, task) {
    debug('createStep sid: %o \t task: %o', sid, task);
    return new Promise((resolve, reject) => {
      const job = jm.task._queue
        .create(sid, task)
        .removeOnComplete(!jm.debug)
        .attempts(task.retry)
        .ttl(task.ttl);
      job
        .on('complete', (result) => {
          debug('createStep complete result: %o', result);
          jm.job._db
            .multi([
              ['hset', `${sid}:${task.idx}`, 'status', 'complete'],
              ['hset', `${sid}:${task.idx}`, 'result', result],
            ])
            .exec()
            .then(() => {
              return this.next(jm, sid, task.idx);
            })
            .then((nextTask) => {
              resolve({ result, nextTask });
            })
            .catch(err => reject(err));
        })
        .on('failed', (errMessage) => {
          return reject(errMessage);
          // return cb(new Error(errMessage), null);
        })
        .save((err) => {
          if (err)
            return reject(err);
          debug('job saved');
        });
    })
      .then((res) => {
        const nextTask = res.nextTask;
        const result = res.result;
        debug('nextTask %o \t result: %o', nextTask, result);
        if (nextTask.idx) {
          nextTask.preResult = result;
          return this.createStep(jm, sid, nextTask);
        }
        for (let i = task.idx; i >= 0; i--)
          jm.job._db.del(`${this.sid}:${i}`);
        return result;
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
        .then((task) => {
          resolve(util.deserialize(task));
        })
        .catch(err => reject(err));
    });
  }
}

module.exports = taskSeries;
