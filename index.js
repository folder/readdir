'use strict';

const fs = require('fs');
const util = require('util');
const path = require('path');
const File = require('./file');

const readdir = (baseDir, options = {}, cb) => {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  if (!cb) {
    return util.promisify(readdir)(baseDir, options);
  }

  let files = [];
  let noop = () => true;
  let toPath = file => (options.absolute || !file.relative) ? file.path : file.relative;
  let push = file => {
    if (file.keep !== false) {
      files.push(options.path ? toPath(file) : file);
    }
  };

  let base = path.resolve(baseDir);
  let onFile = options.onFile || noop;
  let onMatch = options.onMatch || noop;
  let onFolder = options.onFolder || noop;
  let filter = options.filter || (() => options.filesOnly !== true);

  const walk = async (folder, parent, next) => {
    folder.parent = folder.relative = parent;
    folder.isDirectory = () => true;
    let isMatch = filter(folder) === true;
    let dirname = folder.path = path.join(base, parent);
    let recurse = await onMatch(folder);

    await onFolder(folder);
    push(folder);

    if (folder.recurse === false || options.recurse === false) {
      recurse = false;
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
            walk(file, path.join(parent, basename), err => {
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
            file.parent = parent;
            file.relative = path.join(parent, basename);
            file.isDirectory = () => false;
            await onMatch(file);
            await onFile(file);
            push(file);

            if (--len === 0) {
              next(null, files);
            }
          }
        });
      });
    });
  }

  let file = new File(base, path.dirname(base), path.basename(base));
  return walk(file, '', cb);
}

// class File {
//   constructor(base, dirname, basename) {
//     this.base = base;
//     this.dirname = dirname;
//     this.basename = basename;
//     this.path = path.join(dirname, basename);
//   }

//   get folder() {
//     return this._parent ? this._parent.folder : this.basename;
//   }

//   get rest() {
//     if (this._rest) return this._rest;
//     return (this._rest = this.path.slice(this.base.length + 1));
//   }
//   get segs() {
//     if (this._segs) return this._segs;
//     return (this._segs = this.rest.split(path.sep));
//   }
//   get folder() {
//     if (this._folder) return this._folder;
//     return (this._folder = this.segs[0]);
//   }

//   set relative(val) {
//     this._relative = val;
//   }
//   get relative() {
//     return this._relative || path.relative(this.base, this.path);
//   }
// }

module.exports = readdir;
