'use strict';

const start = Date.now();
process.on('exit', () => console.log(`Time: ${Date.now() - start}ms`));

const path = require('path');
const readdir = require('..');

const isIgnoredDir = dirent => {
  return false;
  // return ['tmp', 'vendor', '.git', 'node_modules'].includes(dirent.name);
};

readdir(path.join(__dirname, '..'), { isIgnoredDir, recursive: true })
  .then(console.log)
  .catch(console.error);
