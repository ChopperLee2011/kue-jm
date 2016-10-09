module.exports = (param, previousResult, callback) => {
  setTimeout(() => {
    callback(null, `${previousResult}-${param.foo}`);
  }, 50);
};
