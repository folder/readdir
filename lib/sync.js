'use strict';

const fs = require('fs');
const path = require('path');
const utils = require('./utils');

const kPath = Symbol('path');
const kResult = Symbol('result');
const kRealPathExists = Symbol('realpath-exists');
const kUpdated = Symbol('updated');

const readdirSync = (basedir, options = {}) => {
  if (Array.isArray(basedir)) {
    return readdirsSync(basedir, options);
  }

  const seen = new Set();
  const results = [];

  const {
    absolute,
    onDirectory,
    onFile,
    onEach,
    onPush,
    onSymbolicLink,
    recursive
  } = options;

  const cwd = absolute ? path.resolve(basedir) : basedir;
  let base = options.base || cwd;

  if (absolute && base !== cwd) {
    base = path.resolve(base);
  }

  const depth = typeof options.depth === 'number' ? options.depth : null;
  const dirs = options.dirs !== false && options.nodir !== true;
  const follow = options.follow === true || options.realpath === true || options.symlinks === true;
  const objects = options.objects === true || options.withFileTypes === true;
  const recurse = recursive === true || (depth !== null && depth > 1);
  const sep = options.sep || path.sep;
  const symlinks = (options.symlinks !== false && options.follow !== false) || options.realpath === true;

  const filter = options.filter ? utils.matcher(options.filter) : () => true;
  const isMatch = options.isMatch && utils.matcher(options.isMatch, options);
  const isMaxDepth = file => depth !== null && file.depth >= depth;

  const updatePaths = file => {
    if (!file[kUpdated] && file.path !== file[kPath]) {
      file[kUpdated] = true;
      file.name = path.basename(file.path);
      file.dirname = path.dirname(file.path);
      file.relative = path.relative(file.base, file.path);
    }
  };

  const getReturnValue = (file, parent) => {
    if (file.ignore === true || file.keep === false) return;
    if (filter(file) === false) return;

    if (file.keep !== true) {
      if (file.isSymbolicLink() && symlinks !== true) return;
      if (file.isDirectory() && options.nodir === true) return;
      if (options.dot === false && file.name.startsWith('.')) return;
      if (isMatch) updatePaths(file);
      if (isMatch && isMatch(file, parent) === false) return;
    }

    if (absolute === true) {
      file.path = path.resolve(cwd, file.path);

      if (objects !== true) {
        return file.path;
      }
    }

    updatePaths(file);

    if (objects === true) {
      return file;
    }

    if (options.push !== false) {
      return file.relative;
    }
  };

  const push = (file, parent) => {
    const value = getReturnValue(file, parent);

    if (value && (options.unique !== true || !seen.has(value))) {
      file[kResult] = value;

      if (options.unique === true) {
        seen.add(value);
      }

      if (typeof onPush === 'function') {
        onPush(file);
      }

      results.push(value);
    }
  };

  const shouldStopRecursing = file => {
    return file.recurse === false || (file.recurse !== true && recurse === false);
  };

  const walk = (dirent, parent) => {
    if (onEach) onEach(dirent, parent);
    if (onDirectory) onDirectory(dirent, parent);

    if (dirent.path !== cwd && !dirent.ignore && dirs) {
      push(dirent, parent);
    }

    if (isMaxDepth(dirent)) {
      dirent.recurse = false;
    }

    if (dirent.path !== cwd && shouldStopRecursing(dirent)) {
      return;
    }

    const dirents = fs.readdirSync(dirent.path, { withFileTypes: true });

    for (const file of dirents) {
      file.depth = dirent.depth + 1;
      file.cwd = cwd;
      file.base = base;
      file.folder = dirent.name;
      file.dirname = dirent.path;
      file.path = file[kPath] = `${dirent.path}${sep}${file.name}`;

      let updatedRelative = false;

      // lazily decorate relative path if or when a user supplied function is called
      // if no function is passed, we can avoid calling this function
      const updateRelative = () => {
        if (updatedRelative) return;
        updatedRelative = true;

        if (file[kPath] === file.path && file.base === file.cwd) {
          file.relative = dirent.relative ? `${dirent.relative}${sep}${file.name}` : file.name;
        } else {
          file.relative = path.relative(file.base, file.path);
        }
      };

      if (absolute !== true || objects === true || isMatch) {
        updateRelative();
      }

      if (onEach) {
        updateRelative();
        onEach(file, dirent);
      }

      if (file.isSymbolicLink()) {
        try {
          if (typeof onSymbolicLink === 'function') {
            updateRelative();
            onSymbolicLink(file, dirent);
          }

          if (options.realpath) {
            file.path = fs.realpathSync(file.path);
            file.dirname = path.dirname(file.path);
            file[kRealPathExists] = true;
          }

          if (options.symlinks === true || (options.nodir !== true && follow === true) || options.stat === true) {
            file.stat = fs.statSync(file.path);
            file.isFile = () => file.stat.isFile();
            file.isDirectory = () => file.stat.isDirectory();
          }

        } catch (err) {
          if (err.code !== 'ENOENT') {
            throw err;
          }

          file[kRealPathExists] = false;
        }
      } else if (options.stat === true) {
        file.stat = fs.statSync(file[kPath]);
      }

      if (file.isDirectory()) {
        walk(file, dirent);
        continue;
      }

      if (typeof onFile === 'function') {
        updateRelative();
        onFile(file, dirent);
      }

      push(file, dirent);
    }
  };

  const dirent = new fs.Dirent(null, 2);
  dirent.depth = 0;
  dirent.base = base;
  dirent.path = cwd;
  dirent.cwd = cwd;
  dirent.relative = '';
  dirent[kPath] = cwd;

  walk(dirent, null);
  return results;
};

const readdirsSync = (dirs, options = {}) => {
  const unique = options.unique === true;
  const seen = new Set();
  const files = [];

  const onPush = (file, parent) => {
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
      options.onPush(file, parent);
    }
  };

  const opts = { ...options, onPush };

  for (const dir of [].concat(dirs)) {
    readdirSync(dir, opts);
  }

  return unique ? [...files] : files;
};

readdirSync.FILE_RESULT = kResult;
module.exports = readdirSync;
