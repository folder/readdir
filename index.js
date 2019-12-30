'use strict';

const nodeFs = require('fs');
const path = require('path');
const util = require('util');

const resolve = str => path.isAbsolute(str) ? str : path.resolve(str);
const readdir = (dir, options, cb) => {
  if (typeof options === 'function') {
    return readdir(dir, null, options);
  }

  if (typeof cb !== 'function') {
    return util.promisify(readdir)(dir, options);
  }

  if (Array.isArray(dir)) {
    return readdirs(dir, { ...options, multiple: true }, cb);
  }

  if (typeof dir !== 'string') {
    cb(new TypeError('Expected dir to be a string'));
    return;
  }

  const opts = { ...options };
  const fs = opts.fs ? { ...nodeFs, ...opts.fs } : nodeFs;
  const stat = util.promisify(fs.stat);
  const ignore = opts.ignore ? readdir.matcher(fs, opts.ignore, opts) : () => false;
  const filter = opts.filter ? readdir.matcher(fs, opts.filter, opts) : () => true;
  const symlinks = (opts.symlinks !== false && opts.follow !== false) || opts.realpath === true;
  const follow = opts.follow === true || opts.realpath === true || opts.symlinks === true;
  const results = opts.cache || (opts.unique ? new Set() : []);

  if (opts.cache) {
    if (opts.unique && !(opts.cache instanceof Set)) {
      throw new TypeError('options.cache must be a Set when options.unique === true');
    }
    if (!opts.unique && !Array.isArray(opts.cache)) {
      throw new TypeError('Expected options.cache to be an Array');
    }
  }

  const cwd = resolve(dir);
  const base = opts.base ? resolve(opts.base) : cwd;
  const state = { recurse: opts.recursive === true || opts.depth > 0, error: null };

  const push = async file => {
    try {
      if (pushFile(fs, file, opts, { filter, ignore, results, symlinks })) {
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

    fs.readdir(folder.path, { ...options, withFileTypes: true }, (err, files) => {
      if (state.error) return;

      if (err) {
        if (typeof opts.onError === 'function') {
          err.opts = opts;
          err.state = state;
          err.path = folder.path;
          let error = opts.onError(err, folder, { options: opts, state });
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

      files.forEach(async dirent => {
        if (state.error) return;

        try {
          dirent.base = base;
          dirent.cwd = cwd;
          let file = readdir.toFile(dirent, folder);

          if (ignore(file)) {
            if (--len === 0) next(null, results);
            return;
          }

          // It's possible that our file is a symlink that refers to a file
          // that does not actually exist. We want to ignore these files.
          const statFile = async () => {
            try {
              const stats = await stat(file.origPath);
              file.isSymbolicLink = () => true;
              file.isDirectory = () => stats.isDirectory();
              file.isFile = () => stats.isFile();
              file.exists = true;

            } catch (err) {
              file.exists = false;

              if (err.code !== 'ENOENT') {
                state.error = err;
                next(err);
              }
            }
          };

          if (folder.symlink || file.isSymbolicLink()) {
            file.symlink = folder.symlink || file.path;

            if (typeof opts.onSymbolicLink === 'function') {
              await opts.onSymbolicLink(file, state);
            }

            if ((opts.nodir !== true && follow === true) || opts.stat === true) {
              await statFile();
            }

          } else if (opts.stat === true) {
            await statFile();
          }

          if (file.exists === false) {
            if (--len === 0) {
              next(null, results);
            }
          } else if (readdir.isDirectory(file)) {
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
            if (typeof opts.onEach === 'function') {
              file = (await opts.onEach(file, state)) || file;
            }
            if (typeof opts.onFile === 'function') {
              file = (await opts.onFile(file, state)) || file;
            }

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

  // create the initial file object, for our root directory
  const baseFile = readdir.toFile({ path: cwd, name: '' });
  baseFile.base = base;
  baseFile.cwd = cwd;
  baseFile.isSymbolicLink = () => false;
  baseFile.isDirectory = () => true;
  baseFile.isFile = () => false;
  baseFile.depth = -1;

  walk(baseFile, (err, files) => {
    if (state.error) err = state.error;
    if (err && err.code === 'ENOENT' && err.path === cwd) {
      err.message = err.message.replace('ENOENT: ', 'ENOENT: Invalid cwd, ');
    }
    cb(err, err ? [] : (opts.unique ? [...files] : files));
  });
};

readdir.sync = (dir, options) => {
  if (Array.isArray(dir)) {
    return readdirsSync(dir, options);
  }

  if (typeof dir !== 'string') {
    throw new TypeError('Expected dir to be a string');
  }

  const opts = { ...options };
  const fs = opts.fs ? { ...nodeFs, ...opts.fs } : nodeFs;
  const ignore = opts.ignore ? readdir.matcher(fs, opts.ignore, opts) : () => false;
  const filter = opts.filter ? readdir.matcher(fs, opts.filter, opts) : () => true;
  const symlinks = (opts.symlinks !== false && opts.follow !== false) || opts.realpath === true;
  const follow = opts.follow === true || opts.realpath === true || opts.symlinks === true;
  const results = opts.cache || (opts.unique ? new Set() : []);

  if (opts.cache) {
    if (opts.unique && !(opts.cache instanceof Set)) {
      throw new TypeError('options.cache must be a Set when options.unique === true');
    }
    if (!opts.unique && !Array.isArray(opts.cache)) {
      throw new TypeError('Expected options.cache to be an Array');
    }
  }

  const cwd = resolve(dir);
  const base = opts.base ? resolve(opts.base) : cwd;
  const state = { recurse: opts.recursive === true || opts.depth > 0, error: null };

  const push = file => {
    if (pushFile(fs, file, opts, { filter, ignore, results, symlinks })) {
      if (typeof opts.onPush === 'function') opts.onPush(file, state);
      if (file.ignore !== true) {
        results[opts.unique ? 'add' : 'push'](file.result);
      }
    }
  };

  const walk = folder => {
    try {

      if (typeof opts.onEach === 'function') {
        folder = opts.onEach(folder, state) || folder;
      }
      if (typeof opts.onDirectory === 'function') {
        folder = opts.onDirectory(folder, state) || folder;
      }
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

      const files = fs.readdirSync(folder.path, { ...options, withFileTypes: true });

      if (!files || files.length === 0) {
        return;
      }

      for (const dirent of files) {
        try {
          dirent.base = base;
          dirent.cwd = cwd;
          let file = readdir.toFile(dirent, folder);
          if (ignore(file)) {
            continue;
          }

          // It's possible that our symlink refers to a file that does not
          // actually exist. We want to ignore these files.
          const statFile = () => {
            try {
              const stats = fs.statSync(file.origPath);
              file.isSymbolicLink = () => true;
              file.isDirectory = () => stats.isDirectory();
              file.isFile = () => stats.isFile();
              file.exists = true;

            } catch (err) {
              file.exists = false;

              if (err.code !== 'ENOENT') {
                throw err;
              }
            }
          };

          if (folder.symlink !== void 0 || file.isSymbolicLink()) {
            file.symlink = folder.symlink || file.path;

            if (typeof opts.onSymbolicLink === 'function') {
              opts.onSymbolicLink(file, state);
            }

            if ((opts.nodir !== true && follow === true) || opts.stat === true) {
              statFile();
            }

          } else if (opts.stat === true) {
            statFile();
          }

          if (file.exists === false) {
            continue;
          }

          if (readdir.isDirectory(file)) {
            walk(file);

          } else {
            if (typeof opts.onEach === 'function') {
              file = opts.onEach(file, state) || file;
            }
            if (typeof opts.onFile === 'function' && file.isFile()) {
              file = opts.onFile(file, state) || file;
            }

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
        let error = opts.onError(err, folder, { options: opts, state });
        if (error === null) {
          return;
        }
      }
      throw err;
    }
  };

  // create the initial file object, for our root directory
  const baseFile = readdir.toFile({ path: cwd, name: '' });
  baseFile.base = base;
  baseFile.cwd = cwd;
  baseFile.isSymbolicLink = () => false;
  baseFile.isDirectory = () => true;
  baseFile.isFile = () => false;
  baseFile.depth = -1;

  try {
    walk(baseFile);
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

readdir.format = (file, options = {}, { noobjects = false, fs } = {}) => {
  if (options.realpath === true) {
    file.symlink = file.origPath;
    file.path = file.realpath = fs.realpathSync(file.origPath);
  }

  if (typeof options.format === 'function') {
    file = options.format(file);
  }

  if (options.objects === true && !noobjects) {
    return file;
  }

  if (options.absolute !== true) {
    return file.root ? file.path : readdir.relative(file);
  }

  return file.path;
};

readdir.toFile = (file = {}, folder, options) => {
  if (folder) {
    file.path = `${folder.path}/${file.name}`;
    file.dirname = folder.path;
    file.depth = folder.depth + 1;
  }
  file.origPath = file.path;
  return file;
};

readdir.matcher = (fs, value, options) => {
  if (!value) return () => true;

  if (Array.isArray(value)) {
    let matchers = value.map(val => readdir.matcher(fs, val, options));
    return file => matchers.some(fn => fn(file));
  }

  if (typeof value === 'string') {
    return file => file.name === value;
  }

  if (value instanceof RegExp) {
    return file => value.test(readdir.format(file, options, { fs, noobjects: true }));
  }

  if (typeof value === 'function') {
    return file => value(file);
  }

  throw new TypeError(`Invalid matcher value: ${util.inspect(value)}`);
};

readdir.relative = file => {
  if (file.dirname && file.base && file.dirname === file.base) {
    return file.name;
  }
  return path.relative(file.base, file.path);
};

readdir.isDirectory = file => {
  if (!file) return false;
  if (file.stat) return file.stat.isDirectory();
  if (typeof file.isDirectory === 'function') {
    return file.isDirectory();
  }
  return false;
};

const readdirs = (dirs, options, callback) => {
  if (typeof options === 'function') {
    return readdirs(dirs, null, options);
  }

  const unique = options ? options.unique : false;
  const files = unique ? new Set() : [];
  const pending = [];

  const walk = () => {
    return new Promise((resolve, reject) => {
      let rejected = false;

      const handleError = err => {
        if (!rejected) {
          rejected = true;
          reject(err);
        }
      };

      for (const dir of [].concat(dirs)) {
        if (!rejected) {
          pending.push(readdir(dir, { ...options, cache: files }).catch(handleError));
        }
      }

      Promise.all(pending)
        .then(() => unique ? [...files] : files)
        .then(res => resolve(res));
    });
  };

  const promise = walk();

  if (typeof callback === 'function') {
    promise.then(files => callback(null, files)).catch(callback);
    return;
  }

  return promise;
};

const readdirsSync = (dirs, options) => {
  const opts = { ...options };
  const files = opts.unique ? new Set() : [];

  for (const dir of [].concat(dirs)) {
    readdir.sync(dir, { ...opts, cache: files });
  }

  return opts.unique ? [...files] : files;
};

const pushFile = (fs, file, options, { filter, ignore, results, symlinks }) => {
  if (ignore(file)) return false;
  if (options.cwd === file.path) return false;
  if (file.exists === false) return false;
  if (file.keep !== true) {
    if (file.isSymbolicLink() && symlinks !== true) return false;
    if (readdir.isDirectory(file) && options.nodir === true) return false;
    if (options.dot !== true && file.isFile() && /^\./.test(file.name)) return false;
  }
  if (file.keep !== false && filter(file) === true) {
    file.result = readdir.format(file, options, { fs });
    if (file.result === '') return false;
    return true;
  }
  return false;
};

module.exports = readdir;
