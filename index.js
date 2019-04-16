'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const stat = util.promisify(fs.stat);

const readdir = (dir, options, cb) => {
  if (typeof options === 'function') {
    return readdir(dir, null, options);
  }

  if (typeof cb !== 'function') {
    return util.promisify(readdir)(dir, options);
  }

  const opts = { ...options };
  const ignore = opts.ignore ? matcher(opts.ignore, opts) : () => false;
  const filter = opts.filter ? matcher(opts.filter, opts) : () => true;
  const symlinks = (opts.symlinks !== false && opts.follow !== false) || opts.realpath === true;
  const results = opts.unique ? new Set() : [];
  const cache = { symlinks: new Set() };

  let cwd = path.resolve(dir);
  let base = path.resolve(opts.base || cwd);
  let recurse = opts.recursive === true || opts.depth > 0;

  const push = file => {
    if (file.keep !== true) {
      if (file.isSymbolicLink() && symlinks !== true) return;
      if (file.path === cwd || (isDirectory(file) && opts.nodir === true)) return;
      if (opts.dot !== true && file.isFile() && /^\./.test(file.name)) return;
    }
    if (!ignore(file) && file.keep !== false && filter(file) === true) {
      file.result = format(file, opts);
      if (typeof opts.onPush === 'function') {
        opts.onPush(file);
      }
      results[opts.unique ? 'add' : 'push'](file.result);
    }
  };

  const walk = async(folder, next) => {
    if (typeof opts.onEach === 'function') {
      await opts.onEach(folder);
    }
    if (typeof opts.onDirectory === 'function') {
      await opts.onDirectory(folder);
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
      next(null, results);
      return;
    }

    if (opts.follow === true) {
      if (cache.symlinks.has(folder.path)) return;
      cache.symlinks.add(folder.path);
    }

    fs.readdir(folder.path, { ...options, withFileTypes: true }, (err, files) => {
      if (err) {
        next(err);
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
        let file = toFile(dirent, folder);

        if (typeof opts.onSymbolicLink === 'function' && file.isSymbolicLink()) {
          await opts.onSymbolicLink(file);
        }

        if (opts.follow === true || opts.realpath === true || opts.symlinks === true) {
          if ((opts.nodir !== true && file.isSymbolicLink()) || folder.symlink) {
            file.symlink = file.origPath;
            let origStat = file.stat || file;
            // it's possible that our symlink links to a file that does not
            // actually exist. we want to ignore these files
            file.stat = await stat(file.origPath).catch(err => {
              return err.code !== 'ENOENT' ? Promise.reject(err) : origStat;
            });
          }
        }

        try {
          if (isDirectory(file)) {
            walk(file, err => {
              if (err) {
                next(err);
                return;
              }

              if (--len === 0) {
                next(null, results);
              }
            });
          } else {
            if (typeof opts.onEach === 'function') {
              await opts.onEach(file);
            }
            if (typeof opts.onFile === 'function') {
              await opts.onFile(file);
            }

            push(file);

            if (--len === 0) {
              next(null, results);
            }
          }
        } catch (err) {
          file.keep = false;

          if (err.code !== 'ENOENT' || !err.stack.includes('realpathSync')) {
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
  let file = toFile({ cwd, base, path: cwd, name: '' });
  file.isSymbolicLink = () => false;
  file.isDirectory = () => true;
  file.isFile = () => false;
  file.depth = -1;

  walk(file, (err, files) => {
    cb(err, err ? [] : opts.unique ? [...files] : files);
  });
};

readdir.sync = (dir, options) => {
  if (typeof dir !== 'string') {
    throw new TypeError('Expected dir to be a string');
  }

  const opts = { ...options };
  const ignore = opts.ignore ? matcher(opts.ignore, opts) : () => false;
  const filter = opts.filter ? matcher(opts.filter, opts) : () => true;
  const symlinks = opts.symlinks !== false || opts.follow === true || opts.realpath === true;
  const results = opts.unique ? new Set() : [];
  const cache = { symlinks: new Set() };

  let cwd = path.resolve(dir);
  let base = path.resolve(opts.base || cwd);
  let recurse = opts.recursive === true || opts.depth > 0;

  const push = file => {
    if (file.isSymbolicLink() && symlinks !== true) return;
    if (file.path === cwd || (isDirectory(file) && opts.nodir === true)) return;
    if (opts.dot !== true && file.isFile() && /^\./.test(file.name)) return;
    if (file.keep === false || filter(file) !== true) return;
    if (!ignore(file)) {
      file.result = format(file, opts);
      if (typeof opts.onPush === 'function') {
        opts.onPush(file);
      }
      results[opts.unique ? 'add' : 'push'](file.result);
    }
  };

  const walk = folder => {
    if (typeof opts.onEach === 'function') {
      opts.onEach(folder);
    }
    if (typeof opts.onDirectory === 'function') {
      opts.onDirectory(folder);
    }
    push(folder);

    if (typeof folder.recurse === 'boolean') {
      recurse = folder.recurse;
    }

    if (folder.path !== cwd && recurse === false) {
      return;
    }

    if (Number.isInteger(opts.depth) && folder.depth >= opts.depth - 1) {
      return;
    }

    if (opts.follow === true) {
      if (cache.symlinks.has(folder.path)) return;
      cache.symlinks.add(folder.path);
    }

    let files = fs.readdirSync(folder.path, { ...options, withFileTypes: true });
    if (files.length === 0) {
      return;
    }

    files.forEach(dirent => {
      dirent.base = base;
      dirent.cwd = cwd;
      let file = toFile(dirent, folder);

      if (typeof opts.onSymbolicLink === 'function' && file.isSymbolicLink()) {
        opts.onSymbolicLink(file);
      }

      if (opts.follow === true || opts.realpath === true || opts.symlinks === true) {
        let isSymlink = file.isSymbolicLink();
        if (opts.nodir !== true && isSymlink || folder.symlink) {
          file.symlink = file.origPath;
          let origStat = file.stat || file;
          // it's possible that our symlink links to a file that does not
          // actually exist. we want to ignore these files
          try {
            file.stat = fs.statSync(file.origPath) || origStat;
          } catch (err) {
            if (err.code !== 'ENOENT') {
              throw err;
            }
          }
        }
      }

      try {
        if (isDirectory(file)) {
          walk(file);
        } else {
          if (typeof opts.onEach === 'function') {
            opts.onEach(file);
          }
          if (typeof opts.onFile === 'function' && file.isFile()) {
            opts.onFile(file);
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
  let file = toFile({ cwd, base, path: cwd, name: '' });
  file.isSymbolicLink = () => false;
  file.isDirectory = () => true;
  file.isFile = () => false;
  file.depth = -1;

  walk(file);
  return opts.unique ? [...results] : results;
};

const toFile = (file = {}, folder, options) => {
  if (folder) {
    file.path = path.join(folder.path, file.name);
    file.depth = folder.depth + 1;
  }
  file.basename = file.name;
  file.origPath = file.path;
  return file;
};

const isDirectory = file => {
  if (file.stat !== void 0) return file.stat.isDirectory();
  if (typeof file.isDirectory === 'function') {
    return file.isDirectory();
  }
  return false;
};

const format = (file, options = {}, noobjects = false) => {
  if (options.realpath === true) {
    file.symlink = file.origPath;
    file.path = fs.realpathSync(file.origPath);
  }

  if (typeof options.format === 'function') {
    file = options.format(file);
  }

  if (options.objects === true && !noobjects) {
    return file;
  }

  if (options.absolute !== true) {
    return path.relative(file.base, file.path);
  }

  if (options.basename === true) {
    return file.name;
  }
  return file.path;
};

const matcher = (value, options) => {
  if (!value) return () => true;

  if (Array.isArray(value)) {
    let matchers = value.map(val => matcher(val, options));
    return file => matchers.some(fn => fn(file));
  }

  if (typeof value === 'string') {
    return file => file.name === value;
  }

  if (value instanceof RegExp) {
    return file => value.test(format(file, options, true));
  }

  if (typeof value === 'function') {
    return file => value(file);
  }

  throw new TypeError('Invalid matcher value: ' + util.inspect(value));
};

module.exports = readdir;
