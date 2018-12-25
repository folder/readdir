'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const isWindows = process.platform === 'win32';

class File {
  constructor(base, dirname, basename) {
    this.history = [path.join(dirname, basename)];
    this.base = base;
    this.path = this.history[0];
  }

  [util.inspect.custom]() {
    let filepath = this.path && this.base ? `"${this.path}"` : '';
    let inspect = filepath.replace(/^(?:\.\.\/)+volumes\/(\w+)/, '$1:');
    return `<File ${inspect}>`;
  }

  isDirectory() {
    return this.stat.isDirectory();
  }

  isSymbolicLink() {
    return this.stat.isSymbolicLink();
  }

  isLink() {
    return this.isSymbolicLink() || (isWindows && /\.lnk$/i.test(this.path));
  }

  set stat(value) {
    this._stat = value;
  }
  get stat() {
    return this._stat || (this._stat = fs.lstatSync(this.path));
  }

  set relative(value) {
    this._relative = value;
  }
  get relative() {
    return this._relative || path.relative(this.base, this.path);
  }

  set base(base) {
    if (base === null || base === void 0) return;
    if (base === this._base) return;
    this._base = base;
  }
  get base() {
    return this._base;
  }

  set path(filepath) {
    if (filepath && filepath !== this.path) {
      this.history.push(filepath);
    }
  }
  get path() {
    return this.history[this.history.length - 1];
  }

  set dirname(dirname) {
    this.path = path.join(dirname, this.basename);
  }
  get dirname() {
    return path.dirname(this.path);
  }

  set basename(basename) {
    this.path = path.join(this.dirname, basename);
  }
  get basename() {
    return path.basename(this.path);
  }

  set stem(stem) {
    this.basename = stem + this.extname;
  }
  get stem() {
    return path.basename(this.path, this.extname);
  }

  set extname(extname) {
    this.basename = this.stem + extname;
  }
  get extname() {
    return path.extname(this.path);
  }
}

module.exports = File;
