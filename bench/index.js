'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const rimraf = util.promisify(require('rimraf'));
const Composer = require('composer');
const composer = new Composer();
const bench = require('./bench');

const { fdir: Fdir } = require('fdir');
const enhanced = require('@mrmlnc/readdir-enhanced');
const readdirp = require('readdirp');
const readdir = require('..');

const pause = (ms = 1000) => new Promise(res => setTimeout(res, ms));

const fdir = (dir, options) => {
  return new Fdir()
    .withFullPaths()
    .withMaxDepth(0)
    .withDirs()
    .crawl(dir)
    .withPromise();
};

const fdirRecursive = (dir, options) => {
  return new Fdir()
    .withFullPaths()
    .withDirs()
    .crawl(dir)
    .withPromise();
};

const log = files => console.log(files.length);
const fixtures = path.join(__dirname, 'fixtures/node_modules');
let shouldDelete = false;

composer.task('recursive-large', () => {
  const dir = path.join(__dirname, '..');
  shouldDelete = true;

  return bench('recursive ~57,200 files (just gatsby!)')
    .add('fdir', () => fdirRecursive(dir))
    .add('@folder/readdir', () => readdir(dir, { recursive: true }))
    .add('readdir-enhanced', () => enhanced.async(dir, { deep: true, basePath: dir }))
    .add('readdirp', () => readdirp.promise(dir))
    .run();
});

composer.task('recursive-mid', async () => {
  const dir = path.join(__dirname, '..');
  const files = await readdir(dir, { recursive: true });

  if (shouldDelete || fs.existsSync(fixtures)) {
    await rimraf(fixtures, { glob: false });
    await pause(1000);
  }

  return bench(`recursive ~${files.length} files`)
    .add('fdir', () => fdirRecursive(dir))
    .add('@folder/readdir', () => readdir(dir, { recursive: true }))
    .add('readdir-enhanced', () => enhanced.async(dir, { deep: true, basePath: dir }))
    .add('readdirp', () => readdirp.promise(dir))
    .run();
});

composer.task('recursive', async () => {
  if (shouldDelete || fs.existsSync(fixtures)) {
    await rimraf(fixtures, { glob: false });
    await pause(1000);
  }

  return bench('recursive ~220 files')
    .add('fdir', () => fdirRecursive(__dirname))
    .add('@folder/readdir', () => readdir(__dirname, { recursive: true }))
    .add('readdir-enhanced', () => enhanced.async(__dirname, { deep: true, basePath: __dirname }))
    .add('readdirp', () => readdirp.promise(__dirname))
    .run();
});

composer.task('single', async () => {
  if (shouldDelete || fs.existsSync(fixtures)) {
    await rimraf(fixtures, { glob: false });
    await pause(1000);
  }

  return bench('single directory (~5-10 files)')
    .add('fdir', () => fdir(__dirname))
    .add('@folder/readdir', () => readdir(__dirname))
    .add('readdir-enhanced', () => enhanced.async(__dirname, { basePath: __dirname }))
    .add('readdirp', () => readdirp.promise(__dirname, { depth: 1 }))
    .run();
});

composer.task('benchmarks', ['recursive-mid', 'recursive', 'single']);
composer.build('benchmarks').catch(console.error);
