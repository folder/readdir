'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

exports.resolve = filepath => {
  return path.isAbsolute(filepath) ? filepath : path.resolve(filepath);
};

exports.format = (file, options = {}, { noobjects = false } = {}) => {
  const ofs = options.fs || {};
  const realpathSync = ofs.realpathSync || fs.realpathSync;

  if (options.realpath === true) {
    file.symlink = file.history[0];
    file.path = file.realpath = realpathSync(file.symlink);
  }

  if (typeof options.format === 'function') {
    file = options.format(file);
  }

  if (options.objects === true && !noobjects) {
    return file;
  }

  if (options.absolute !== true) {
    return file.root ? file.path : path.relative(file.base, file.path);
  }

  return file.path;
};

exports.matcher = (value, options) => {
  if (Array.isArray(value)) {
    const matchers = value.map(val => exports.matcher(val, options));
    return file => matchers.some(fn => fn(file));
  }

  if (typeof value === 'string') {
    return file => file.name === value;
  }

  if (value instanceof RegExp) {
    return file => value.test(exports.format(file, options, { noobjects: true }));
  }

  if (typeof value === 'function') {
    return file => value(file);
  }

  throw new TypeError(`Invalid matcher value: ${util.inspect(value)}`);
};
