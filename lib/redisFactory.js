'use strict';

const Redis = require('ioredis');
const kue = require('kue');

const getSentinels = (sentinelsString) => {
  return sentinelsString.split(',').map((each) => {
    return {
      host: each.split(':')[0],
      port: each.split(':')[1],
    };
  });
};

exports.job = (opt) => {
  const redis = new Redis({
    sentinels: getSentinels(opt.redisSentinelForJob),
    name: opt.redisSentinelNameForJob,
  });
  redis.select(opt.redisDBForJob || 1);
  return redis;
};

exports.task = (opt) => {
  return kue.createQueue({
    prefix: opt.prefix || 'q',
    redis: {
      createClientFactory: () => {
        return new Redis({
          sentinels: getSentinels(opt.redisSentinelForJob),
          name: opt.redisSentinelNameForJob,
          db: opt.redisDBForTask || 0,
        });
      },
    },
  });
};
