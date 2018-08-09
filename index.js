'use strict';

const fs = require('fs');
const util = require('util');
const path = require('path');
const noop = () => true;

const readdir = (baseDir, options = {}, cb) => {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  if (!cb) {
    return util.promisify(readdir)(baseDir, options);
  }

  let files = [];
  let push = file => files.push(options.path ? file.path : file);
  let base = path.resolve(baseDir);
  let onMatch = options.onMatch || noop;
  let filter = options.filter || noop;

  const walk = (folder, next) => {
    let isMatch = filter(folder) === true;
    let recurse = folder.recurse !== false && options.recurse !== false;
    let dirname = folder.path;

    onMatch(folder);

    if (isMatch) {
      push(file);
    }

    if (dirname !== base && recurse === false) {
      next(null, files);
      return;
    }

    fs.readdir(dirname, (err, paths) => {
      if (err) {
        err.file = folder;
        next(err);
        return;
      }

      let len = paths.length;
      if (len === 0) {
        next(null, files);
        return;
      }

      paths.forEach(basename => {
        let file = new File(base, dirname, basename);

        fs.lstat(file.path, async(err, stat) => {
          file.stat = stat;

          if (err) {
            err.file = file;
            next(err);
            return;
          }

          if (stat.isDirectory()) {
            walk(file, err => {
              if (err) {
                err.file = file;
                next(err);
                return;
              }

              if (--len === 0) {
                next(null, files);
              }
            });
          } else {
            file.isDirectory = () => false;
            let isMatch = await onMatch(file);
            if (isMatch) {
              push(file);
            }

            if (--len === 0) {
              next(null, files);
            }
          }
        });
      });
    });
  }

  let file = new File(base, path.dirname(base), path.basename(base));
  return walk(file, cb);
}

class File {
  constructor(base, dirname, basename) {
    this.history = [];
    this.base = base;
    this.path = path.join(dirname, basename);
    Reflect.defineProperty(this, 'stat', { value: null, writable: true });
  }

  isDirectory() {
    return this.stat ? this.stat.isDirectory() : false;
  }

  isAbsolute() {
    return path.isAbsolute(this.path);
  }

  get absolute() {
    return path.resolve(this.path);
  }

  get relative() {
    return path.relative(this.base, this.path);
  }

  // set base(val) {
  //   if (val === null || val === void 0) return;

  //   let base = path.normalize(val);
  //   if (base === this._base) return;

  //   // ensure that file.relative is always correct
  //   let filepath = this.history.length ? this.path : null;
  //   let relative = filepath ? this.relative : null;

  //   this._base = base;

  //   if (relative && filepath.indexOf(base) !== 0) {
  //     this.path = path.resolve(base, relative);
  //   }
  // }
  // get base() {
  //   return this._base;
  // }

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

  set dirname(dirname) {
    this.path = path.join(dirname, this.basename);
  }
  get dirname() {
    return path.dirname(this.path);
  }

  set folder(folder) {
    this.path = path.join(path.dirname(this.dirname), folder, this.basename);
  }
  get folder() {
    return path.basename(this.dirname);
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

readdir.readdirs = (dirs, options) => {
  const pending = [];
  const files = [];
  for (let dir of [].concat(dirs)) {
    pending.push(readdir(dir, options).then(f => files.push(...f)));
  }
  return Promise.all(pending).then(() => files);
};

module.exports = readdir;
