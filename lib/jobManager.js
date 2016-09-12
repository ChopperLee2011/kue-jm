'use strict';

const kue = require('kue');
const EventEmitter = require('events').EventEmitter;
const uuid = require('node-uuid').v4();
const assert = require('assert');
const redisFactory = require('./redisFactory');
const taskSeries = require('./taskSeries');
const debug = require('debug')('card-management:jobmanager');

const jm = Symbol('jm');

class JobManager extends EventEmitter {

  constructor(opt) {
    super();
    opt = opt || {};
    this.type = opt.type;
    this.job = { _db: redisFactory.job(opt) };
    this.task = { _queue: redisFactory.task(opt), collections: new Map() };
  }

  /**
   * Add a job to the job manager.
   * @param {String} job type
   * @param {Object} job data
   * @param {Object} options
   * @return
   */
  addJob(type, data, opt) {
    opt = opt || {};
    const uniqField = opt.uniqField || 'id';
    if (!data[uniqField]) {
      throw Error(`data[${uniqField}] can not be empty.`);
    }
    const key = `${type}:${uniqField}:${data[uniqField]}`;
    const jobTTL = opt.jobTTL || 1000 * 60 * 5;
    const resultTTL = opt.jobResultTTL || 3600 * 24 * 3;
    const jobDb = this.job._db;

    return new Promise((resolve, reject) => {
      jobDb.set(key, '')
        .then(() => {
          const job = this.task._queue
            .create(type, data)
            .removeOnComplete(true)
            .ttl(jobTTL);
          job.on('complete', result => {
            if (resultTTL < 0) {
              jobDb.set(key, JSON.stringify(result));
            } else {
              jobDb.setex(key, resultTTL, JSON.stringify(result));
            }
          });
          job.save(err => {
            if (err) {
              jobDb.del(key);
              return reject(new Error('save job error.'));
            }
            jobDb.set(key, job.id);
            this.job.instance = job;
            resolve(job);
          });
        })
        .catch(err => reject(err));
    })
  };

  addTasks(jobType, tasks) {
    //todo: implements task model
    this.task.collections.set(jobType, tasks);
  }

  /**
   * watchStuckJobs.
   * @param {Number} interval
   * @return
   */
  watchStuckJobs(interval) {
    interval = interval || 1000 * 60;
    const orgPrefix = this.task._queue.client.prefix;
    this.task._queue.client.prefix = 'q';
    this.task._queue.watchStuckJobs(interval);
    this.task._queue.client.prefix = orgPrefix;
  };

  /**
   * start job type.
   * @param {String} job type
   * @param {Number} concurrency
   * @return
   */
  start(type, concurrency) {
    // const self = this;
    concurrency = concurrency || 1;

    return new Promise((resolve, reject) => {
      this.task._queue.process(type, concurrency, (job, done) => {
        const series = new taskSeries();
        this.addTasks(type, []);
        series.executeTasks(this, this.task.collections.get(type))
          .then(res => {
            resolve(res);
          })
          .catch(err => reject(err));
      })
    });
  };

  cloneJob() {
    return;
  }

  toJSON() {
    return;
  }

  clean() {
    return;
  }
}

module.exports = JobManager;