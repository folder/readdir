'use strict';

const fs = require('fs');
const util = require('util');
const path = require('path');
const File = require('./file');

const readdir = (baseDir, options, cb) => {
  if (typeof options === 'function') {
    cb = options;
    options = null;
  }

  if (typeof cb !== 'function') {
    return readdir.promise(baseDir, options);
  }

  let opts = { withFileTypes: true, ...options };
  let filter = opts.filter || (() => true);
  let result = [];
  let push = file => result.push(opts.withFileTypes ? file : file.path);

  const walk = (folder, next) => {
    if (folder.path !== baseDir) {
      if (filter(folder) === true) {
        push(folder);
      } else {
        next(null, result);
        return;
      }
    }

    fs.readdir(folder.path, { withFileTypes: true }, (err, paths) => {
      if (err) {
        next(err);
        return;
      }

      let len = paths.length;
      if (len === 0) {
        next(null, result);
        return;
      }

      paths.forEach(file => {
        file.path = path.join(folder.path, file.name);

        if (file.isDirectory()) {
          walk(file, err => {
            if (err) {
              next(err);
              return;
            }

            if (--len === 0) {
              next(null, result);
            }
          });
        } else {
          if (filter(file) === true) {
            push(file);
          }

          if (--len === 0) {
            next(null, result);
          }
        }
      });
    });
  }

  let file = new fs.Dirent(baseDir);
  file.path = path.resolve(file.name);
  file.name = path.basename(file.path);
  file.isDirectory = () => true;
  walk(file, cb);
};

readdir.promise = (...args) => {
  return new Promise((resolve, reject) => {
    readdir(...args, (err, files) => {
      if (err) {
        reject(err);
      } else {
        resolve(files);
      }
    });
  });
};

module.exports = readdir;
