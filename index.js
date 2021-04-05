'use strict';

const { defineProperty } = Reflect;
const fs = require('fs');
const path = require('path');
const util = require('util');
const utils = require('./lib/utils');

/**
 * Symbols
 */

const kStat = Symbol('stat');
const kRealFileExists = Symbol('real-file-exists');

/**
 * Default options
 */

const defaults = {
  absolute: false,
  base: null,
  cwd: null,
  depth: null,
  dot: true,
  follow: null,
  fs: null,
  nodir: false,
  objects: false,
  realpath: false,
  recursive: false,
  stat: null,
  symlinks: null,
  unique: false,

  // Functions
  format: null,

  isJunk: () => false,
  ignore: () => false,
  isMatch: () => true,

  onError: () => {},
  onPush: () => {},
  onSymbolicLink: () => {},
  onDirectory: () => {},
  onEach: () => {},
  onEmpty: () => {},
  onFile: () => {}
};

/**
 * Readdir
 */

const readdir = (dir, options, cb) => {
  if (typeof options === 'function') {
    return readdir(dir, null, options);
  }

  if (typeof cb !== 'function') {
    return util.promisify(readdir)(dir, options);
  }

  if (Array.isArray(dir)) {
    return readdirs(dir, { ...options, multiple: true })
      .then(files => cb(null, files))
      .catch(cb);
  }

  if (typeof dir !== 'string') {
    cb(new TypeError('Expected dir to be a string'));
    return;
  }

  const opts = { ...defaults, ...options };
  const stat = util.promisify((opts.fs && opts.fs.stat) || fs.stat);
  const readDir = (opts.fs && opts.fs.readdir) || fs.readdir;

  const symlinks = (opts.symlinks !== false && opts.follow !== false) || opts.realpath === true;
  const follow = opts.follow === true || opts.realpath === true || opts.symlinks === true;

  const ignore = opts.ignore ? utils.matcher(opts.ignore, opts) : () => false;
  const isMatch = opts.isMatch ? utils.matcher(opts.isMatch, opts) : () => true;
  const results = opts.unique ? new Set() : [];

  const cwd = utils.resolve(dir);
  const base = opts.base ? utils.resolve(opts.base) : cwd;
  const state = { recurse: opts.recursive === true || opts.depth > 0, error: null };

  const push = async file => {
    if (ignore(file)) return;

    try {
      if (isValidFile(file, opts, { isMatch, results, symlinks })) {
        if (typeof opts.onPush === 'function') await opts.onPush(file, state);
        if (file.ignore !== true) {
          results[opts.unique ? 'add' : 'push'](file.result);
        }
      }
    } catch (err) {
      return Promise.reject(err);
    }
  };

  const walk = async (folder, next) => {
    if (state.error) return;

    try {
      if (typeof opts.onEach === 'function') {
        folder = (await opts.onEach(folder, state)) || folder;
      }
      if (typeof opts.onDirectory === 'function') {
        folder = (await opts.onDirectory(folder, state)) || folder;
      }

      await push(folder);
    } catch (err) {
      state.error = err;
      next(err);
      return;
    }

    if (typeof folder.recurse === 'boolean') {
      state.recurse = folder.recurse;
    }

    if (folder.path !== cwd && state.recurse === false) {
      next(null, results);
      return;
    }

    if (Number.isInteger(opts.depth) && folder.depth >= opts.depth - 1) {
      folder.recurse = false;
      next(null, results);
      return;
    }

    readDir(folder.path, { ...options, withFileTypes: true }, (err, files) => {
      if (state.error) return;

      if (err) {
        if (typeof opts.onError === 'function') {
          err.opts = opts;
          err.state = state;
          err.path = folder.path;
          const error = opts.onError(err, folder, { options: opts, state });
          if (error === null) {
            next(null, results);
            return;
          }
        }

        state.error = err;
        next(err);
        return;
      }

      let len = files.length;
      if (len === 0) {
        next(null, results);
        return;
      }

      files.forEach(async file => {
        if (state.error) return;

        try {
          file.path = path.join(folder.path, file.name);
          file.dirname = folder.path;
          file.history = [file.path];
          file.base = base;
          file.cwd = cwd;
          file.depth = folder.depth + 1;

          if (ignore(file)) {
            if (--len === 0) next(null, results);
            return;
          }

          // It's possible that our file is a symlink that refers to a file
          // that does not actually exist. We want to ignore these files.
          const statFile = async () => {
            try {
              const stats = await stat(file.path);
              file.isSymbolicLink = () => true; // we know this is true at this point
              file.isDirectory = () => stats.isDirectory();
              file.isFile = () => stats.isFile();
              file[kRealFileExists] = true;

            } catch (err) {
              file[kRealFileExists] = false;

              if (err.code !== 'ENOENT') {
                state.error = err;
                next(err);
              }
            }
          };

          if (folder.symlink || file.isSymbolicLink()) {
            file.symlink = folder.symlink || file.path;

            if (typeof opts.onSymbolicLink === 'function') await opts.onSymbolicLink(file, state);
            if ((opts.nodir !== true && follow === true) || opts.stat === true) {
              await statFile();
            }

          } else if (opts.stat === true) {
            await statFile();
          }

          if (file[kRealFileExists] === false) {
            if (--len === 0) {
              next(null, results);
            }
          } else if (file.isDirectory()) {
            walk(file, err => {
              if (err) {
                state.error = err;
                next(err);
                return;
              }

              if (--len === 0) {
                next(null, results);
              }
            });
          } else {
            if (typeof opts.onEach === 'function') await opts.onEach(file, state);
            if (typeof opts.onFile === 'function') await opts.onFile(file, state);
            await push(file);

            if (--len === 0) {
              next(null, results);
            }
          }
        } catch (err) {
          if (err.code !== 'ENOENT' || !err.stack.includes('realpathSync')) {
            state.error = err;
            next(err);
            return;
          }

          if (--len === 0) {
            next(null, results);
          }
        }
      });
    });
  };

  // create the initial file object, for our root directory. Since
  // this file is not a _real_ instance of fs.Dirent, we need to
  // decorate some properties in case they are needed.
  const dirent = new fs.Dirent(path.basename(cwd), 2);
  dirent.path = cwd;
  dirent.history = [cwd];
  dirent.base = base;
  dirent.cwd = cwd;
  dirent.depth = -1;

  walk(dirent, (err, files) => {
    if (state.error) err = state.error;
    if (err && err.code === 'ENOENT' && err.path === cwd) {
      err.message = err.message.replace('ENOENT: ', 'ENOENT: Invalid cwd, ');
    }
    cb(err, err ? [] : (opts.unique ? [...files] : files));
  });
};

/**
 * Sync
 */

readdir.sync = (dir, options) => {
  if (Array.isArray(dir)) {
    return readdirsSync(dir, options);
  }

  if (typeof dir !== 'string') {
    throw new TypeError('Expected dir to be a string');
  }

  const opts = { ...options };
  const readdirSync = opts.fs && opts.fs.readdirSync || fs.readdirSync;
  const statSync = opts.fs && opts.fs.statSync || fs.statSync;

  const symlinks = (opts.symlinks !== false && opts.follow !== false) || opts.realpath === true;
  const follow = opts.follow === true || opts.realpath === true || opts.symlinks === true;

  const ignore = opts.ignore ? utils.matcher(opts.ignore, opts) : () => false;
  const isMatch = opts.isMatch ? utils.matcher(opts.isMatch, opts) : () => true;
  const results = opts.unique ? new Set() : [];

  const cwd = utils.resolve(dir);
  const base = opts.base ? utils.resolve(opts.base) : cwd;
  const state = { recurse: opts.recursive === true || opts.depth > 0, error: null };

  const push = file => {
    if (ignore(file)) return;
    if (isValidFile(file, opts, { isMatch, results, symlinks })) {
      if (typeof opts.onPush === 'function') opts.onPush(file, state);
      if (file.ignore !== true) {
        results[opts.unique ? 'add' : 'push'](file.result);
      }
    }
  };

  const walk = folder => {
    try {
      if (typeof opts.onEach === 'function') opts.onEach(folder, state);
      if (typeof opts.onDirectory === 'function') opts.onDirectory(folder, state);
      if (typeof folder.recurse === 'boolean') {
        state.recurse = folder.recurse;
      }

      push(folder);

      if (folder.path !== cwd && state.recurse === false) {
        return;
      }

      if (Number.isInteger(opts.depth) && folder.depth >= opts.depth - 1) {
        folder.recurse = false;
        return;
      }

      const files = readdirSync(folder.path, { ...options, withFileTypes: true });

      if (!files || files.length === 0) {
        return;
      }

      for (const file of files) {
        try {
          file.path = path.join(folder.path, file.name);
          file.dirname = folder.path;
          file.history = [file.path];
          file.base = base;
          file.cwd = cwd;
          file.depth = folder.depth + 1;

          if (ignore(file)) {
            continue;
          }

          // It's possible that our symlink refers to a file that does not
          // actually exist. We want to ignore these files.
          const statFile = () => {
            try {
              const stats = statSync(file.history[0]);
              file.isSymbolicLink = () => true; // we know this is true at this point
              file.isDirectory = () => stats.isDirectory();
              file.isFile = () => stats.isFile();
              file[kRealFileExists] = true;

            } catch (err) {
              file[kRealFileExists] = false;

              if (err.code !== 'ENOENT') {
                throw err;
              }
            }
          };

          if (folder.symlink !== void 0 || file.isSymbolicLink()) {
            file.symlink = folder.symlink || file.path;

            if (typeof opts.onSymbolicLink === 'function') opts.onSymbolicLink(file, state);
            if ((opts.nodir !== true && follow === true) || opts.stat === true) {
              statFile();
            }

          } else if (opts.stat === true) {
            statFile();
          }

          if (file.exists === false) {
            continue;
          }

          if (file.isDirectory()) {
            walk(file);

          } else {
            if (typeof opts.onEach === 'function') opts.onEach(file, state);
            if (typeof opts.onFile === 'function' && file.isFile()) opts.onFile(file, state);
            push(file);
          }

        } catch (err) {
          if (err.code !== 'ENOENT' || !err.stack.includes('realpathSync')) {
            throw err;
          }
        }
      }

    } catch (err) {
      if (typeof opts.onError === 'function') {
        err.opts = opts;
        err.state = state;
        err.path = folder.path;
        const error = opts.onError(err, folder, { options: opts, state });
        if (error === null) {
          return;
        }
      }
      throw err;
    }
  };

  const dirent = new fs.Dirent(path.basename(cwd), 2);
  dirent.path = cwd;
  dirent.base = base;
  dirent.cwd = cwd;
  dirent.history = [dirent.path];

  dirent.isSymbolicLink = () => dirent.stat ? dirent.stat.isSymbolicLink() : false;
  dirent.isDirectory = () => dirent.stat ? dirent.stat.isDirectory() : true;
  dirent.isFile = () => dirent.stat ? dirent.stat.isFile() : false;
  dirent.depth = -1;

  defineProperty(dirent, 'stat', {
    set(stat) {
      this[kStat] = stat;
    },
    get() {
      return this[kStat] || (this[kStat] = statSync(this.path));
    }
  });

  try {
    walk(dirent);
  } catch (err) {
    /* eslint-disable no-ex-assign */
    if (state.error) err = state.error;
    if (err && err.code === 'ENOENT' && err.path === cwd) {
      err.message = err.message.replace('ENOENT: ', 'ENOENT: Invalid cwd, ');
    }
    throw err;
  }

  return opts.unique ? [...results] : results;
};

const isValidFile = (file, options, { isMatch, ignore, results, symlinks }) => {
  if (options.cwd === file.path) return false;
  if (file.exists === false) return false;
  if (file.keep === false) return false;

  if (file.keep !== true) {
    if (file.isSymbolicLink() && symlinks !== true) return false;
    if (file.isDirectory() && options.nodir === true) return false;
    if (options.dot === false && file.name[0] !== '.') return false;
    if (isMatch(file) === false) return false;
  }

  file.result = utils.format(file, options);
  return file.result !== '';
};

const readdirs = (dirs, options = {}) => {
  const unique = options.unique === true;
  const files = unique ? new Set() : [];
  const pending = [];

  const onPush = file => {
    files[unique ? 'add' : 'push'](file.result);
  };

  for (const dir of [].concat(dirs)) {
    pending.push(readdir(dir, { ...options, onPush }));
  }

  return Promise.all(pending).then(() => unique ? [...files] : files);
};

const readdirsSync = (dirs, options = {}) => {
  const unique = options.unique === true;
  const files = unique ? new Set() : [];

  const onPush = file => {
    files[unique ? 'add' : 'push'](file.result);
  };

  for (const dir of [].concat(dirs)) {
    readdir.sync(dir, { ...options, onPush });
  }

  return unique ? [...files] : files;
};

/**
 * Expose readdir
 */

readdir.fast = require('./lib/fast');
readdir.basic = require('./lib/basic');
module.exports = readdir;
module.exports.default = readdir;
