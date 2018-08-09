'use strict';

const { green, bold } = require('ansi-colors');
const fs = require('fs');
const path = require('path');
const util = require('util');
const pico = require('picomatch');
const glob = util.promisify(require('glob'));
const ignore = require('parse-gitignore')(fs.readFileSync('.gitignore'));
const timer = require('../timer');
const readdir = require('../');

/**
 * Options
 */

const ignored = ['node_modules', 'test', 'temp', 'vendor', 'tmp', '.DS_Store', '.git'];
const isIgnored = pico.matcher(ignore);
const isMatch = pico.matcher('**/*.js');
const options = {
  filter(file) {
    if (file.stat.isDirectory()) {
      let relative = path.relative(file.base, file.path);
      file.recurse = !isIgnored(relative);
      return false;
    }
    return isMatch(file.path);
  }
};

/**
 * Read
 */

const time = timer('Total');
const log = files => console.log(bold('\nFiles:'), green(files.length.toLocaleString()));
const cwd = '../';

readdir(cwd, { ...options })
// glob('**/*.js', { ...options, cwd, ignore })
  .then(files => console.log(files))
  // .then(files => log(files))
  .then(() => time())
  .catch(console.error);
