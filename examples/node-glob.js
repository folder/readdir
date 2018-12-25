'use strict';

const path = require('path');
const util = require('util');
const timer = require('../bench/timer');
const gtime = timer('node-glob');
const glob = util.promisify(require('glob'));

const { green, bold } = require('ansi-colors');
const log = files => console.log(bold('\nFiles:'), green(files.length.toLocaleString()));

glob('**', { cwd: path.join(__dirname, '../..'), ignore: ['**/node_modules/**'] })
// glob('**/*.txt', { cwd: path.join(__dirname, '../vendor') })
  .then(files => log(files))
  .then(() => gtime())
  .catch(console.log)
