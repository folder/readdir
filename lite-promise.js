'use strict';

const readdir = require('./lite');

module.exports = (baseDir, options, filter = () => true) => {
  if (typeof options === 'function') {
    filter = options;
    options = { filter };
  }

  let opts = { filter, ...options };

  return new Promise((resolve, reject) => {
    readdir(baseDir, opts, (err, files) => {
      if (err) {
        reject(err);
      } else {
        resolve(files);
      }
    });
  });
};
