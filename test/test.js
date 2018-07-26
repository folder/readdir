'use strict';

require('mocha');
const util = require('util');
const assert = require('assert');
const readdir = require('..');

describe('readdir', function() {
  it('should files in a directory and return a promise', function() {
    return readdir(__dirname)
      .then(files => {
        assert.equal(files[0].basename, 'test.js');
      });
  });

  it('should take a transform function as the last argument', async() => {
    const files = await readdir(__dirname, file => {
      file.stem = 'foo';
      return file;
    });

    assert.equal(files[0].basename, 'foo.js');
  });
});
