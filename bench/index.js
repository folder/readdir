'use strict';

const readdirEnhanced = require('@mrmlnc/readdir-enhanced');
const readdirp = require('readdirp');
const Composer = require('composer');
const composer = new Composer();
const bench = require('./bench');
const readdir = require('..');

const enhanced = (dir, options) => {
  const filter = file => !/(^|\/)\./.test(file.path);
  let files = [];

  return new Promise((resolve, reject) => {
    readdirEnhanced.stream(dir, { deep: false, filter, ...options })
      .on('data', () => {})
      .on('file', file => files.push(file))
      .on('directory', file => files.push(file))
      .on('error', reject)
      .on('end', () => {
        resolve(files);
      });

  });
}

composer.task('readdir', () => {
  return bench('readdir')
    .add('@folder/readdir', () => readdir(__dirname, { nodir: true }))
    .add('readdir-enhanced', () => enhanced(__dirname))
    .add('readdirp', () => readdirp.promise(__dirname, { depth: 1 }))
    .run();
});

composer.task('recursive', () => {
  return bench('readdir - recursive')
    .add('@folder/readdir', () => readdir(__dirname, { recursive: true }))
    .add('readdir-enhanced', () => enhanced(__dirname, { deep: true }))
    .add('readdirp', () => readdirp.promise(__dirname))
    .run();
});

composer.task('default', ['readdir', 'recursive']);

composer.build('default').catch(console.error);
