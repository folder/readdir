'use strict';

const timer = require('../bench/timer');
const time = timer('readdir');
const path = require('path');
const readdir = require('..');
const { green, bold } = require('ansi-colors');
const log = files => console.log(bold('\nFiles:'), green(files.length.toLocaleString()));

let filter = file => {
  if (file.isDirectory() && file.name === 'node_modules') {
    return false;
  }
  return file.basename[0] !== '.';
};

readdir(path.join(__dirname, '../..'), {
  filter
  // onMatch(file) {
  //   file.keep = file.basename[0] !== '.';
  //   // console.log(file.relative)
  //   // console.log();
  // }
})
  .then(files => {
    log(files);
    time();
  })
  .catch(console.log);
