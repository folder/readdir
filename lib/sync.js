'use strict';

const fs = require('fs');
const path = require('path');
const utils = require('./utils');

const kPath = Symbol('path');
const kRealPathExists = Symbol('realpath-exists');
const kResult = Symbol('result');

const defaults = {
  absolute: false,
  depth: Infinity,
  dot: true,
  objects: false,
  realpath: false,
  recursive: false,

  onDirectory: null,
  onEach: null,
  onEmpty: null,
  onFile: null
};

const readdirSync = (basedir, options = {}) => {
  if (Array.isArray(basedir)) {
    return readdirsSync(basedir, options);
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
      if (options.isMatch && isMatch(file) === false) return false;
    }

    if (opts.objects === true) {
      return file;
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

  const walk = (dirent, parent) => {
    if (isIgnoredDir(dirent)) return;

    if (onEach) onEach(dirent, parent);
    if (onDirectory) onDirectory(dirent, parent);

    if (dirent.path !== cwd && !dirent.ignore && keepDirs) {
      push(dirent);
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
      file.path = `${dirent.path}${path.sep}${file.name}`;
      file[kPath] = file.path;

      if (onEach) {
        onEach(file, dirent);
      }

      if (file.isSymbolicLink()) {
        try {
          if (typeof onSymbolicLink === 'function') {
            onSymbolicLink(file, dirent);
          }

          if (opts.realpath) {
            file.path = fs.realpathSync(file.path);
            file.dirname = path.dirname(file.path);
            file[kRealPathExists] = true;
          }

          if (opts.symlinks === true || (opts.nodir !== true && follow === true) || opts.stat === true) {
            file.stat = fs.statSync(file.path);
            file.isFile = () => file.stat.isFile();
            file.isDirectory = () => file.stat.isDirectory();
          }

        } catch (err) {
          file[kRealPathExists] = false;

          if (err.code !== 'ENOENT') {
            throw err;
          }
        }
      } else if (opts.stat === true) {
        file.stat = fs.statSync(file[kPath]);
      }

      if (!file.relative) {
        if (file[kPath] === file.path && file.base === file.cwd) {
          file.relative = dirent.relative ? `${dirent.relative}${path.sep}${file.name}` : file.name;
        } else {
          file.relative = path.relative(file.base, file.path);
        }
      }

      if (file.isDirectory()) {
        walk(file, dirent);
        continue;
      }

      if (!isIgnoredFile(file)) {
        if (typeof onFile === 'function') {
          onFile(file, dirent);
        }

        push(file);
      }
    }
  };

  const dirent = new fs.Dirent(path.basename(cwd), 2);
  dirent.depth = 0;
  dirent.base = base;
  dirent.path = cwd;
  dirent.cwd = cwd;
  dirent.relative = '';
  dirent[kPath] = dirent.path;

  walk(dirent, null);
  return results;
};

const readdirsSync = (dirs, options = {}) => {
  const unique = options.unique === true;
  const files = unique ? new Set() : [];

  const onPush = file => {
    files[unique ? 'add' : 'push'](file[kResult]);
    if (options.onPush) {
      options.onPush(file);
    }
  };

  for (const dir of [].concat(dirs)) {
    readdirSync(dir, { ...options, onPush });
  }

  return unique ? [...files] : files;
};

module.exports = readdirSync;
