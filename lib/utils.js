'use strict';

const util = require('util');

exports.matcher = (value, options) => {
  if (Array.isArray(value)) {
    const matchers = value.map(val => exports.matcher(val, options));
    return (file, parent) => matchers.some(fn => fn(file, parent));
  }

  if (typeof value === 'function') {
    return (file, parent) => value(file, parent);
  }

  if (typeof value === 'string') {
    return file => file.name === value;
  }

  if (value instanceof RegExp) {
    return file => value.test(file.relative || file.path);
  }

  throw new TypeError(`Invalid matcher value: ${util.inspect(value)}`);
};
