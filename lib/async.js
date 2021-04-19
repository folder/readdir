'use strict';

const fs = require('fs');
const path = require('path');
const utils = require('./utils');
const { realpath, stat } = fs.promises;

const kPath = Symbol('path');
const kResult = Symbol('result');
const kRealPathExists = Symbol('realpath-exists');

const readdir = async (basedir, options = {}) => {
  if (Array.isArray(basedir)) {
    return readdirs(basedir, options);
  }

  const seen = new Set();
  const results = [];

  const {
    absolute,
    isIgnoredDir,
    isIgnoredFile,
    onDirectory,
    onFile,
    onEach,
    onPush,
    onSymbolicLink,
    recursive
  } = options;

  const cwd = basedir;
  const base = options.base || cwd;
  const depth = typeof options.depth === 'number' ? options.depth : null;
  const dirs = options.dirs !== false && options.nodir !== true;
  const follow = options.follow === true || options.realpath === true || options.symlinks === true;
  const objects = options.objects === true || options.withFileTypes === true;
  const recurse = recursive === true || (depth !== null && depth > 1);
  const sep = options.sep || path.sep;
  const symlinks = (options.symlinks !== false && options.follow !== false) || options.realpath === true;

  const isMatch = options.isMatch && utils.matcher(options.isMatch, options);
  const isMaxDepth = file => depth !== null && file.depth >= depth;

  const getReturnValue = file => {
    if (file.ignore === true || file.keep === false) return;
    if (file.keep !== true) {
      if (symlinks !== true && follow !== true && file.isSymbolicLink()) return;
      if (dirs !== true && file.isDirectory()) return;
      if (options.nodir === true && file.isDirectory()) return;
      if (options.dot === false && file.name.startsWith('.')) return;
      if (isMatch && isMatch(file) === false) return false;
    }

    if (file.path !== file[kPath]) {
      file.name = path.basename(file.path);
      file.dirname = path.dirname(file.path);
      file.relative = path.relative(file.base, file.path);
    }

    if (objects === true) {
      return file;
    }

    if (absolute === true) {
      return file.path;
    }

    if (options.push !== false) {
      return file.relative;
    }
  };

  const push = async file => {
    const value = getReturnValue(file);

    if (value && (options.unique !== true || !seen.has(value))) {
      file[kResult] = value;

      if (options.unique === true) {
        seen.add(value);
      }

      if (typeof onPush === 'function') {
        await onPush(file);
      }

      results.push(value);
    }
  };

  const shouldStopRecursing = file => {
    return file.path !== cwd && (file.recurse === false || (file.recurse !== true && recurse === false));
  };

  const walk = async (dirent, parent, next) => {
    if (typeof isIgnoredDir === 'function' && isIgnoredDir(dirent)) {
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

    if (dirent.path !== cwd) {
      await push(dirent);
    }

    if (isMaxDepth(dirent)) {
      dirent.recurse = false;
    }

    if (shouldStopRecursing(dirent)) {
      next(null, results);
      return;
    }

    fs.readdir(dirent.path, { withFileTypes: true }, async (err, files) => {
      if (err) {
        if (err.code === 'ENOENT') {
          next(null, results);
          return;
        }
        err.file = dirent;
        next(err);
        return;
      }

      let len = files.length;
      if (len === 0) {
        next(null, results);
        return;
      }

      for (const file of files) {
        file.depth = dirent.depth + 1;
        file.cwd = cwd;
        file.base = base;
        file.folder = dirent.name;
        file.dirname = dirent.path;
        file.path = `${dirent.path}${sep}${file.name}`;
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

            if (options.realpath) {
              file.path = await realpath(file.path);
              file.dirname = path.dirname(file.path);
              file[kRealPathExists] = true;
            }

            if (options.symlinks === true || (options.nodir !== true && follow === true) || options.stat === true) {
              file.stat = await stat(file.path);
              file.isFile = () => file.stat.isFile();
              file.isDirectory = () => file.stat.isDirectory();
            }

          } catch (err) {
            if (err.code !== 'ENOENT') {
              next(err);
              return;
            }

            file[kRealPathExists] = false;
          }
        } else if (options.stat === true) {
          file.stat = await stat(file[kPath]);
        }

        if (!file.relative) {
          if (file[kPath] === file.path && file.base === file.cwd) {
            file.relative = dirent.relative ? `${dirent.relative}${sep}${file.name}` : file.name;
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

        if (typeof isIgnoredFile !== 'function' || !isIgnoredFile(file)) {
          if (typeof onFile === 'function') {
            try {
              await onFile(file, dirent);
            } catch (err) {
              next(err);
              return;
            }
          }

          await push(file);
        }

        if (--len === 0) {
          next(null, results);
        }
      }
    });
  };

  return new Promise((resolve, reject) => {
    const dirent = new fs.Dirent(null, 2);
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
      if (err) {
        handleError(err);
        return;
      }

      if (!handled) {
        handled = true;
        resolve(results);
      }
    });

    promise.catch(handleError);
  });
};

const readdirs = (dirs, options = {}) => {
  const unique = options.unique === true;
  const seen = new Set();
  const pending = [];
  const files = [];

  const onPush = async file => {
    const result = file[kResult];

    if (unique === true) {
      if (!seen.has(file.relative)) {
        seen.add(file.relative);
        files.push(result);
      }
    } else {
      files.push(result);
    }

    if (options.onPush) {
      await options.onPush(file);
    }
  };

  const opts = { ...options, onPush };

  for (const dir of [].concat(dirs)) {
    pending.push(readdir(dir, opts));
  }

  return Promise.all(pending).then(() => unique ? [...files] : files);
};

readdir.FILE_RESULT = kResult;
module.exports = readdir;