'use strict';

const { green, bold } = require('ansi-colors');
const fs = require('fs');
const path = require('path');
const util = require('util');
const pico = require('picomatch');
const glob = util.promisify(require('glob'));
const ignore = require('parse-gitignore')(fs.readFileSync('.gitignore'));
const timer = require('../bench/timer');
const readdir = require('../');

/**
 * Options
 */

const ignored = ['node_modules', 'test', 'temp', 'vendor', 'tmp', '.DS_Store', '.git'];
const isIgnored = pico(ignore);
const isMatch = pico('**/*.txt');
const options = {
  filter(file) {
    if (file.isDirectory()) {
      file.recurse = !isIgnored(file.basename);
    }
    file.keep = isMatch(file.path);
  }
};

/**
 * Read
 */

const time = timer('Total');
const log = files => console.log(bold('\nFiles:'), green(files.length.toLocaleString()));
const cwd = path.join(__dirname, '../..');

readdir(cwd, { ...options })
// glob('**/*.js', { ...options, cwd, ignore })
  // .then(files => console.log(files.length))
  .then(files => log(files))
  .then(() => time())
  .catch(console.error);
