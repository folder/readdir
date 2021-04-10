'use strict';

const util = require('util');

exports.matcher = (value, options) => {
  if (Array.isArray(value)) {
    const matchers = value.map(val => exports.matcher(val, options));
    return file => matchers.some(fn => fn(file));
  }

  if (typeof value === 'string') {
    return file => file.name === value;
  }

  if (value instanceof RegExp) {
    return file => value.test(file.relative || file.path);
  }

  if (typeof value === 'function') {
    return file => value(file);
  }

  throw new TypeError(`Invalid matcher value: ${util.inspect(value)}`);
};
