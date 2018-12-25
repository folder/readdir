'use strict';

const fs = require('fs');
const util = require('util');
const path = require('path');
const read = util.promisify(fs.readdir);
const lstat = util.promisify(fs.lstat);
const File = require('./File');
const noop = () => true;

function readdir(baseDir, options = {}, fn) {
  if (typeof options === 'function') {
    fn = options;
    options = {};
  }

  if (typeof fn === 'function') {
    options.onMatch = fn;
  }

  let base = path.resolve(path.normalize(baseDir));
  let onFile = options.onFile || noop;
  let onFolder = options.onFolder || noop;
  let onMatch = options.onMatch || noop;
  let filter = options.filter || noop;

  let files = [];
  let push = file => {
    if (file.keep === true) {
      files.push(options.path ? file.path : file);
    }
  };

  const handleErr = (file, reject) => {
    return err => {
      err.file = file;
      reject(err);
    };
  };

  const walk = (folder, parent = '') => {
    return new Promise(async(resolve, reject) => {
      let fp = folder.path;
      let recurse = await onMatch(folder);
      await onFolder(folder);
      push(folder);

      if (folder.recurse === false || options.recurse === false) {
        recurse = false;
      }

      if (folder.path !== base && recurse === false) {
        resolve(files);
        return;
      }

      read(fp)
        .then(paths => {
          let pending = paths.length;
          let finish = () => {
            if (--pending === 0) {
              resolve(files);
            }
          };

          if (pending === 0) {
            resolve(files);
            return;
          }

          paths.forEach(basename => {
            let file = new File(base, folder.path, basename);

            lstat(file.path)
              .then(async stat => {
                file.stat = stat;

                if (stat.isDirectory()) {
                  file.isDirectory = () => true;
                  walk(file, path.join(parent, basename))
                    .then(finish)
                    .catch(handleErr(file, reject));
                } else {
                  file.isDirectory = () => false;
                  await onMatch(file);
                  await onFile(file);
                  push(file);
                  finish();
                }
              })
              .catch(handleErr(file, reject));
          });
        })
        .catch(handleErr(folder, reject));
    });
  };

  let file = new File(base, path.dirname(base), path.basename(base));
  return walk(file).then(() => files);
}

module.exports = readdir;
