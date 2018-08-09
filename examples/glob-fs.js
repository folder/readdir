const util = require('util');
const path = require('path');
const { green, bold } = require('ansi-colors');
const timer = require('../timer');
const time = timer('glob-fs');

const glob = require('../glob');
const log = files => console.log(bold('\nFiles:'), green(files.length.toLocaleString()));

glob('*/*.js', { cwd: path.join(__dirname, '../vendor') })
// glob('**/*.txt', { cwd: path.join(__dirname, '../vendor') })
// glob(path.join(__dirname, '../vendor/**/*.txt'))
  .then(files => log(files))
  .then(() => time())
  .catch(console.log)

