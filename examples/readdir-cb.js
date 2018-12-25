'use strict';

// require('time-require');
const path = require('path');
const { green, bold } = require('ansi-colors');
const log = files => console.log(bold('\nFiles:'), green(files.length.toLocaleString()));
const readdir = require('../lite');
const timer = require('../bench/timer');
const time = timer('readdir');

const filter = file => {
  if (file.isDirectory() && file.name === 'node_modules') {
    return false;
  }
  return file.name[0] !== '.';
}

readdir(path.join(__dirname, '../..'), { filter }, (err, files) => {
  if (err) return console.log(err);
  log(files);
  time();
});
