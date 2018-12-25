'use strict';

require('mocha');
const util = require('util');
const assert = require('assert');
const readdir = require('../promise');

describe('readdir', function() {
  it('should files in a directory and return a promise', function() {
    return readdir(__dirname)
      .then(files => {
        assert(files.some(f => f.basename === 'test.js'));
      });
  });

  it.only('should take a transform function as the second argument', async() => {
    let files = await readdir(__dirname, file => {
      file.stem = 'foo';
      file.recurse = true;
      return file;
    })
    .catch(console.log)

    assert(files.some(f => f.basename === 'foo.js'));
  });

  it('should take a transform function as the third argument', async() => {
    let files = await readdir(__dirname, {}, file => {
      file.stem = 'foo';
      console.log(file);
      return file;
    });

    assert(files.some(f => f.basename === 'foo.js'));
  });
});
