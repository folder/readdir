'use strict';

const fs = require('fs');
const util = require('util');
const path = require('path');
const read = util.promisify(fs.readdir);
const lstat = util.promisify(fs.lstat);
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
  let push = file => files.push(options.path ? file.path : file);

  const handleErr = (file, reject) => {
    return err => {
      err.file = file;
      reject(err);
    };
  };

  const walk = folder => {
    return new Promise(async(resolve, reject) => {
      let isMatch = (await filter(folder)) === true;
      let dirname = folder.path;

      await onMatch(folder);
      await onFolder(folder);

      if (folder.keep === true) {
        push(folder);
      }

      let recurse = folder.recurse !== false && options.recurse !== false;
      if (dirname !== base && recurse === false) {
        resolve(files);
        return;
      }

      read(dirname)
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
            let file = new File(base, dirname, basename);

            lstat(file.path)
              .then(async stat => {
                file.stat = stat;

                if (stat.isDirectory()) {
                  file.isDirectory = () => true;
                  walk(file)
                    .then(finish)
                    .catch(handleErr(file, reject));
                } else {
                  file.isDirectory = () => false;
                  await onMatch(file);
                  await onFile(file);

                  if (file.keep === true) {
                    push(file);
                  }
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

class File {
  constructor(base, dirname, basename) {
    define(this, 'history', []);
    define(this, 'stat', null);
    this.base = base;
    this.path = path.join(dirname, basename);
    this.contents = null;
  }

  [util.inspect.custom]() {
    let filepath = this.path && this.base ? `"${this.absolute}"` : '';
    let inspect = filepath.replace(/^(?:\.\.\/)+volumes\/(\w+)/, '$1:');
    return `<File ${inspect}>`;
  }

  isDirectory() {
    if (!this.isNull()) return false;
    if (this.stat && typeof this.stat.isDirectory === 'function') {
      return this.stat.isDirectory();
    }
    return false;
  }

  isSymbolicLink() {
    if (!this.isNull()) return false;
    if (this.stat && typeof this.stat.isSymbolicLink === 'function') {
      return this.stat.isSymbolicLink();
    }
    return false;
  }

  isAbsolute() {
    return path.isAbsolute(this.path);
  }

  isNull() {
    return this.contents === null;
  }

  get absolute() {
    return this.isAbsolute() ? this.path : path.resolve(this.path);
  }

  get relative() {
    return path.relative(this.base, this.path);
  }

  set base(val) {
    if (val === null || val === void 0) return;

    let base = path.normalize(val);
    if (base === this._base) return;
    define(this, '_base', base);

    let filepath = this.history.length ? this.path : null;
    let relative = filepath ? this.relative : null;
    if (relative && filepath.indexOf(base) !== 0) {
      this.path = path.resolve(base, relative);
    }
  }
  get base() {
    return this._base;
  }

  set path(filepath) {
    if (filepath === '') return;
    let val = path.normalize(filepath);
    if (val !== this.path) {
      this.history.push(val);
    }
  }
  get path() {
    return this.history[this.history.length - 1];
  }

  get baseFolder() {
    return this.relative.split(path.sep)[0];
  }

  set folder(folder) {
    this.path = path.join(path.dirname(this.dirname), folder, this.basename);
  }
  get folder() {
    return path.basename(this.dirname);
  }

  set dirname(dirname) {
    this.path = path.join(dirname, this.basename);
  }
  get dirname() {
    return path.dirname(this.path);
  }

  set basename(basename) {
    this.path = path.join(this.dirname, basename);
  }
  get basename() {
    return path.basename(this.path);
  }

  set stem(stem) {
    this.basename = stem + this.extname;
  }
  get stem() {
    return path.basename(this.path, this.extname);
  }

  set extname(extname) {
    this.basename = this.stem + extname;
  }
  get extname() {
    return path.extname(this.path);
  }
}

function define(file, key, value) {
  Reflect.defineProperty(file, key, { writable: true, value });
}

readdir.readdirs = (dirs, options) => {
  const pending = [];
  const files = [];
  for (let dir of [].concat(dirs)) {
    pending.push(readdir(dir, options).then(f => files.push(...f)));
  }
  return Promise.all(pending).then(() => files);
};

module.exports = readdir;
