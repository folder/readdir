'use strict';

const fs = require('fs');
const path = require('path');
const utils = require('./utils');

const kPath = Symbol('path');
const kRealPathExists = Symbol('realpath-exists');
const kResult = Symbol('result');

const defaults = {
  depth: Infinity,
  objects: false,
  realpath: false,
  recursive: false,

  onDirectory: null,
  onEach: null,
  onEmpty: null,
  onFile: null
};

const readdir = async (basedir, options = {}) => {
  if (Array.isArray(basedir)) {
    return readdirs(basedir, options);
  }

  const opts = { ...defaults, ...options };

  const isMaxDepth = file => file.depth >= opts.depth;
  const isIgnoredFile = opts.isIgnoredFile || (() => false);
  const isIgnoredDir = opts.isIgnoredDir || (() => false);
  const isMatch = opts.isMatch ? utils.matcher(opts.isMatch, opts) : () => true;

  const keepDirs = opts.dirs !== false && opts.nodir !== true;
  const cwd = path.resolve(basedir);
  const base = opts.base ? path.resolve(opts.base) : cwd;
  const seen = new Set();
  const results = [];

  const symlinks = (opts.symlinks !== false && opts.follow !== false) || opts.realpath === true;
  const follow = opts.follow === true || opts.realpath === true || opts.symlinks === true;
  const recurse = opts.recursive === true || (typeof options.depth === 'number' && options.depth > 1);

  const getReturnValue = file => {
    if (file.keep === false) return;
    if (file.ignore === true) return;

    if (file.keep !== true) {
      if (file.isSymbolicLink() && symlinks !== true) return;
      if (file.isDirectory() && options.nodir === true) return;
      if (options.dot === false && file.name[0] === '.') return;
      if (isMatch(file) === false) return false;
    }

    if (opts.objects === true) {
      return file;
    }

    if (opts.relative === true) {
      return file.relative;
    }

    if (opts.absolute === true) {
      return file.path;
    }

    if (opts.push !== false) {
      if (file.path !== file[kPath]) {
        const { dir, base } = path.parse(file.path);
        file.name = base;
        file.dirname = dir;
        file.relative = path.relative(file.base, file.path);
      }

      return file.relative;
    }
  };

  const push = file => {
    const value = getReturnValue(file);
    if (!value) return;
    if (opts.unique === true && seen.has(value)) return;
    seen.add(value);

    file[kResult] = value;
    if (typeof opts.onPush === 'function') opts.onPush(file);
    results.push(value);
  };

  const shouldStopRecursing = file => {
    return file.recurse === false || (file.recurse !== true && recurse === false);
  };

  const {
    onDirectory,
    onFile,
    onEach,
    onSymbolicLink
  } = opts;

  const walk = async (dirent, parent, next) => {
    if (isIgnoredDir(dirent)) {
      next(null, results);
      return;
    }

    try {
      if (onEach) await onEach(dirent, parent);
      if (onDirectory) await onDirectory(dirent, parent);
    } catch (err) {
      next(err);
      return;
    }

    if (dirent.path !== cwd && !dirent.ignore && keepDirs) {
      push(dirent);
    }

    if (isMaxDepth(dirent)) {
      dirent.recurse = false;
    }

    if (dirent.path !== cwd && shouldStopRecursing(dirent)) {
      next(null, results);
      return;
    }

    fs.readdir(dirent.path, { withFileTypes: true }, async (err, dirents) => {
      if (err) {
        if (err.code === 'ENOENT') {
          next(null, results);
          return;
        }
        err.file = dirent;
        next(err);
        return;
      }

      let len = dirents.length;
      if (len === 0) {
        next(null, results);
        return;
      }

      for (const file of dirents) {
        file.depth = dirent.depth + 1;
        file.cwd = cwd;
        file.base = base;
        file.folder = dirent.name;
        file.dirname = dirent.path;
        file.path = path.join(dirent.path, file.name);
        file[kPath] = file.path;

        if (onEach) {
          try {
            await onEach(file, dirent);
          } catch (err) {
            next(err);
            return;
          }
        }

        if (file.isSymbolicLink()) {
          try {
            if (typeof onSymbolicLink === 'function') {
              await onSymbolicLink(file, dirent);
            }

            if (opts.realpath) {
              file.path = await fs.promises.realpath(file.path);
              file.dirname = path.dirname(file.path);
              file[kRealPathExists] = true;
            }

            if (opts.symlinks === true || (opts.nodir !== true && follow === true) || opts.stat === true) {
              file.stat = await fs.promises.stat(file.path);
              file.isFile = () => file.stat.isFile();
              file.isDirectory = () => file.stat.isDirectory();
            }

          } catch (err) {
            file[kRealPathExists] = false;

            if (err.code !== 'ENOENT') {
              next(err);
              return;
            }
          }
        } else if (opts.stat === true) {
          file.stat = await fs.promises.stat(file[kPath]);
        }

        if (!file.relative) {
          if (file[kPath] === file.path && file.base === file.cwd) {
            file.relative = path.join(dirent.relative, file.name);
          } else {
            file.relative = path.relative(file.base, file.path);
          }
        }

        if (file.isDirectory()) {
          walk(file, dirent, (err, res) => {
            if (err) {
              err.parent = dirent;
              err.file = file;
              next(err);
              return;
            }

            if (--len === 0) {
              next(null, results);
            }
          });
          continue;
        }

        if (!isIgnoredFile(file)) {
          if (onFile) {
            try {
              await onFile(file, dirent);
            } catch (err) {
              next(err);
              return;
            }
          }

          push(file);
        }

        if (--len === 0) {
          next(null, results);
        }
      }
    });
  };

  return new Promise((resolve, reject) => {
    const dirent = new fs.Dirent(path.basename(cwd), 2);
    dirent.depth = 0;
    dirent.base = base;
    dirent.path = cwd;
    dirent.cwd = cwd;
    dirent.relative = '';
    dirent[kPath] = dirent.path;

    let handled = false;
    const handleError = err => {
      if (!handled) {
        handled = true;
        reject(err);
      }
    };

    const promise = walk(dirent, null, (err, results) => {
      if (handled) return;
      if (err) {
        handleError(err);
      } else {
        handled = true;
        resolve(results);
      }
    });

    promise.catch(handleError);
  });
};

const readdirs = (dirs, options = {}) => {
  const unique = options.unique === true;
  const files = unique ? new Set() : [];
  const pending = [];

  const onPush = file => {
    files[unique ? 'add' : 'push'](file[kResult]);
    if (options.onPush) {
      options.onPush(file);
    }
  };

  for (const dir of [].concat(dirs)) {
    pending.push(readdir(dir, { ...options, onPush }));
  }

  return Promise.all(pending).then(() => unique ? [...files] : files);
};

module.exports = readdir;
