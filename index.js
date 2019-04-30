'use strict';

const nodefs = require('fs');
const path = require('path');
const util = require('util');

const resolve = str => path.isAbsolute(str) ? str : path.resolve(str);
const pushFile = (fs, file, options, { filter, ignore, results, symlinks }) => {
  if (options.cwd === file.path) return;
  if (file.exists === false) return;
  if (file.keep !== true) {
    if (file.isSymbolicLink() && symlinks !== true) return;
    if (readdir.isDirectory(file) && options.nodir === true) return;
    if (options.dot !== true && file.isFile() && /^\./.test(file.name)) return;
  }
  if (!ignore(file) && file.keep !== false && filter(file) === true) {
    file.result = readdir.format(file, options, { fs });
    if (file.result === '') return;
    if (typeof options.onPush === 'function') options.onPush(file);
    results[options.unique ? 'add' : 'push'](file.result);
  }
};

const readdir = (dir, options, cb) => {
  if (typeof options === 'function') {
    return readdir(dir, null, options);
  }

  if (typeof cb !== 'function') {
    return util.promisify(readdir)(dir, options);
  }

  if (Array.isArray(dir)) {
    return readdirs(dir, options, cb);
  }

  if (typeof dir !== 'string') {
    cb(new TypeError('Expected dir to be a string'));
    return;
  }

  const opts = { ...options };
  const fs = opts.fs ? { ...nodefs, ...opts.fs } : nodefs;
  const stat = util.promisify(fs.stat);
  const ignore = opts.ignore ? readdir.matcher(fs, opts.ignore, opts) : () => false;
  const filter = opts.filter ? readdir.matcher(fs, opts.filter, opts) : () => true;
  const symlinks = (opts.symlinks !== false && opts.follow !== false) || opts.realpath === true;
  const follow = opts.follow === true || opts.realpath === true || opts.symlinks === true;
  const results = opts.unique ? new Set() : [];
  const cache = { symlinks: new Set() };

  let cwd = resolve(dir);
  let base = opts.base ? resolve(opts.base) : cwd;
  let recurse = opts.recursive === true || opts.depth > 0;

  const push = file => {
    pushFile(fs, file, opts, { filter, ignore, results, symlinks });
  };

  let error = null;
  const handleError = (err, next) => {
    if (error === null) {
      error = err;
      next();
    }
  };

  const walk = async(folder, next) => {
    if (error) return;

    if (typeof opts.onEach === 'function') {
      folder = (await opts.onEach(folder)) || folder;
    }
    if (typeof opts.onDirectory === 'function') {
      folder = (await opts.onDirectory(folder)) || folder;
    }

    push(folder);

    if (typeof folder.recurse === 'boolean') {
      recurse = folder.recurse;
    }

    if (folder.path !== cwd && recurse === false) {
      next(null, results);
      return;
    }

    if (Number.isInteger(opts.depth) && folder.depth >= opts.depth - 1) {
      folder.recurse = false;
      next(null, results);
      return;
    }

    fs.readdir(folder.path, { ...options, withFileTypes: true }, (err, files) => {
      if (err) {
        handleError(err, next);
        return;
      }

      let len = files.length;
      if (len === 0) {
        next(null, results);
        return;
      }

      files.forEach(async dirent => {
        dirent.base = base;
        dirent.cwd = cwd;
        let file = readdir.toFile(dirent, folder);

        // It's possible that our symlink refers to a file that does not
        // actually exist. We want to ignore these files.
        let statFile = async() => {
          try {
            file.stat = await stat(file.origPath);
            file.isDirectory = file.stat.isDirectory.bind(file.stat);
          } catch (err) {
            file.exists = false;

            if (err.code !== 'ENOENT') {
              handleError(err, next);
              return;
            }
          }
        };

        if (folder.symlink !== void 0 || file.isSymbolicLink()) {
          file.symlink = folder.symlink || file.path;
          cache.symlinks.add(file.symlink);

          if (typeof opts.onSymbolicLink === 'function') {
            await opts.onSymbolicLink(file);
          }

          if ((opts.nodir !== true && follow === true) || opts.stat === true) {
            await statFile();
          }

        } else if (opts.stat === true) {
          await statFile();
        }

        try {
          if (readdir.isDirectory(file)) {
            walk(file, err => {
              if (err) {
                handleError(err, next);
                return;
              }

              if (--len === 0) {
                next(null, results);
              }
            });
          } else {
            if (typeof opts.onEach === 'function') {
              file = (await opts.onEach(file)) || file;
            }
            if (typeof opts.onFile === 'function') {
              file = (await opts.onFile(file)) || file;
            }

            push(file);

            if (--len === 0) {
              next(null, results);
            }
          }
        } catch (err) {
          file.keep = false;

          if (err.code !== 'ENOENT' || !err.stack.includes('realpathSync')) {
            handleError(err, next);
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
  let file = readdir.toFile({ path: cwd, name: '' });
  file.base = base;
  file.cwd = cwd;
  file.isSymbolicLink = () => false;
  file.isDirectory = () => true;
  file.isFile = () => false;
  file.depth = -1;

  walk(file, (err, files) => {
    if (error) err = error;
    if (err && err.code === 'ENOENT' && err.path === cwd) {
      err.message = err.message.replace('ENOENT: ', 'ENOENT: Invalid cwd, ');
    }
    cb(err, err ? [] : (opts.unique ? [...files] : files));
  });
};

readdir.sync = (dir, options = {}) => {
  if (Array.isArray(dir)) {
    return readdirsSync(dir, options);
  }

  if (typeof dir !== 'string') {
    throw new TypeError('Expected dir to be a string');
  }

  const opts = { ...options };
  const fs = opts.fs ? { ...nodefs, ...opts.fs } : nodefs;
  const ignore = opts.ignore ? readdir.matcher(fs, opts.ignore, opts) : () => false;
  const filter = opts.filter ? readdir.matcher(fs, opts.filter, opts) : () => true;
  const symlinks = (opts.symlinks !== false && opts.follow !== false) || opts.realpath === true;
  const follow = opts.follow === true || opts.realpath === true || opts.symlinks === true;
  const results = opts.unique ? new Set() : [];
  const cache = { symlinks: new Set() };

  let cwd = resolve(dir);
  let base = opts.base ? resolve(opts.base) : cwd;
  let recurse = opts.recursive === true || opts.depth > 0;

  const push = file => {
    pushFile(fs, file, opts, { filter, ignore, results, symlinks });
  };

  const walk = folder => {
    if (typeof opts.onEach === 'function') {
      folder = opts.onEach(folder) || folder;
    }
    if (typeof opts.onDirectory === 'function') {
      folder = opts.onDirectory(folder) || folder;
    }
    if (typeof folder.recurse === 'boolean') {
      recurse = folder.recurse;
    }

    push(folder);

    if (folder.path !== cwd && recurse === false) {
      return;
    }

    if (Number.isInteger(opts.depth) && folder.depth >= opts.depth - 1) {
      folder.recurse = false;
      return;
    }

    let files = fs.readdirSync(folder.path, { ...options, withFileTypes: true });
    if (files.length === 0) {
      return;
    }

    files.forEach(dirent => {
      dirent.base = base;
      dirent.cwd = cwd;
      let file = readdir.toFile(dirent, folder);

      // It's possible that our symlink refers to a file that does not
      // actually exist. We want to ignore these files.
      let statFile = () => {
        try {
          file.stat = fs.statSync(file.origPath);
          file.isDirectory = file.stat.isDirectory.bind(file.stat);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            throw err;
          }
          file.exists = false;
        }
      };

      if (opts.stat === true || folder.symlink !== void 0 || file.isSymbolicLink()) {
        file.symlink = folder.symlink || file.path;
        cache.symlinks.add(file.symlink);
        if (typeof opts.onSymbolicLink === 'function') {
          opts.onSymbolicLink(file);
        }

        if ((opts.nodir !== true && follow === true) || opts.stat === true) {
          statFile();
        }

      } else if (opts.stat === true) {
        statFile();
      }

      try {
        if (readdir.isDirectory(file)) {
          walk(file);
        } else {
          if (typeof opts.onEach === 'function') {
            file = opts.onEach(file) || file;
          }
          if (typeof opts.onFile === 'function' && file.isFile()) {
            file = opts.onFile(file) || file;
          }
          push(file);
        }

      } catch (err) {
        file.keep = false;

        if (err.code !== 'ENOENT' || !err.stack.includes('realpathSync')) {
          throw err;
        }
      }
    });
  };

  // create the initial file object, for our root directory
  let file = readdir.toFile({ path: cwd, name: '' });
  file.base = base;
  file.cwd = cwd;

  file.isSymbolicLink = () => false;
  file.isDirectory = () => true;
  file.isFile = () => false;
  file.depth = -1;

  try {
    walk(file);
  } catch (err) {
    if (err.code === 'ENOENT' && err.path === cwd) {
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
    file.path = folder.path + '/' + file.name;
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

  throw new TypeError('Invalid matcher value: ' + util.inspect(value));
};

readdir.relative = file => {
  if (file.dirname && file.base && file.dirname === file.base) {
    return file.name;
  }
  return path.relative(file.base, file.path);
};

readdir.isDirectory = file => {
  if (file.stat !== void 0) return file.stat.isDirectory();
  if (typeof file.isDirectory === 'function') {
    return file.isDirectory();
  }
  return false;
};

const readdirs = (dirs, options, cb) => {
  if (typeof options === 'function') {
    return readdirs(dirs, null, options);
  }

  let opts = { ...options };
  let files = opts.unique ? new Set() : [];
  let onPush = opts.onPush;
  let pending = [];

  opts.onPush = file => {
    files[opts.unique ? 'add' : 'push'](file.result);
    onPush && onPush(file);
  };

  for (let dir of dirs) pending.push(readdir(dir, opts));

  let promise = Promise.all(pending)
    .then(() => opts.unique ? [...new Set(files)] : files);

  if (typeof cb === 'function') {
    promise.then(files => cb(null, files)).catch(cb);
    return;
  }

  return promise;
};

const readdirsSync = (dirs, options) => {
  let opts = { ...options };
  let files = opts.unique ? new Set() : [];
  let onPush = opts.onPush;

  opts.onPush = file => {
    files[opts.unique ? 'add' : 'push'](file.result);
    onPush && onPush(file);
  };

  for (let dir of dirs) readdir.sync(dir, opts);
  return opts.unique ? [...new Set(files)] : files;
};

module.exports = readdir;
