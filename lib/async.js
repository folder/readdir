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

  const results = [];
  const cwd = basedir;
  const base = options.base || cwd;
  const seen = new Set();

  const {
    onDirectory,
    onFile,
    onEach,
    onSymbolicLink,
    recursive
  } = options;

  const depth = typeof options.depth === 'number' ? options.depth : null;
  const follow = options.follow === true || options.realpath === true || options.symlinks === true;
  const dirs = options.dirs !== false && options.nodir !== true;
  const recurse = recursive === true || (depth !== null && depth > 1);
  const symlinks = (options.symlinks !== false && options.follow !== false) || options.realpath === true;

  const isIgnoredDir = options.isIgnoredDir || (() => false);
  const isIgnoredFile = options.isIgnoredFile || (() => false);
  const isMatch = options.isMatch && utils.matcher(options.isMatch, options);
  const isMaxDepth = file => depth !== null && file.depth >= depth;

  const getReturnValue = file => {
    if (file.keep === false) return;
    if (file.ignore === true) return;

    if (file.keep !== true) {
      if (file.isSymbolicLink() && symlinks !== true && follow !== true) return;
      if (file.isDirectory() && options.nodir === true) return;
      if (options.dot === false && file.name.startsWith('.')) return;
      if (isMatch && isMatch(file) === false) return false;
    }

    if (file.path !== file[kPath]) {
      const { dir, base } = path.parse(file.path);
      file.name = base;
      file.dirname = dir;
      file.relative = path.relative(file.base, file.path);
    }

    if (options.objects === true) {
      return file;
    }

    if (options.absolute === true) {
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
      seen.add(value);

      if (typeof options.onPush === 'function') {
        await options.onPush(file);
      }

      results.push(value);
    }
  };

  const shouldStopRecursing = file => {
    return file.recurse === false || (file.recurse !== true && recurse === false);
  };

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

    if (dirent.path !== cwd && !dirent.ignore && dirs) {
      await push(dirent);
    }

    if (depth !== null && isMaxDepth(dirent)) {
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
        file.path = `${dirent.path}${path.sep}${file.name}`;
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
            file[kRealPathExists] = false;

            if (err.code !== 'ENOENT') {
              next(err);
              return;
            }
          }
        } else if (options.stat === true) {
          file.stat = await stat(file[kPath]);
        }

        if (!file.relative) {
          if (file[kPath] === file.path && file.base === file.cwd) {
            file.relative = dirent.relative ? `${dirent.relative}${path.sep}${file.name}` : file.name;
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

          await push(file);
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
