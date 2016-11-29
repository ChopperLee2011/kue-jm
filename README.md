# kue-jm 【Deprecated】 
## Move to https://github.com/Wiredcraft/kue-jm
[![Build Status](https://travis-ci.org/ChopperLee2011/kue-jm.svg?branch=master)](https://travis-ci.org/ChopperLee2011/kue-jm)

  a J(ob) M(anager) tool for handling tasks(sub job) sequentially in Kue.js


## Installation

```sh
$ npm i
```

## Test

```sh
$ redis-server &

$ TRAVIS_BUILD_DIR=. bash deploy/setupSentinel.sh

$ npm test
```

## Examples
   if you want see more detail information, please set `DEBUG=jm:*:*` ;


## TODO
 - [ ] implemented with event emitter.
 - [ ] support more job status query.
 - [ ] support more error handler.
