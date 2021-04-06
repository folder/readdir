'use strict';

const readdir = require('./lib/async');
readdir.sync = require('./lib/sync');

module.exports = readdir;
