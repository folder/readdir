'use strict';

require('mocha');
const util = require('util');
const assert = require('assert');
const scan = require('../scan');

describe.skip('scan', function() {
  it('should tokenzie glob patterns', function() {
    scan('foo/**/{,/**}/bar/*.*');
    scan('foo/bar/baz/**/{,/**}/bar/*.*');
    scan('foo/bar/baz//bar/*.*');
    scan('foo/bar/baz/b\\/ar/*.*');
    scan('foo/bar/ba\\+z/b\\*ar/*.*');
    scan('**/{,/*}/bar/*.*');
    scan('!foo/bar');
    scan('aa/**/{,/*}/bar/*.*');
    scan('aa/bb/c/*/{,/*}/bb/.*');
    scan('aa/bb/c//bb/*');
    scan('aa/bb/c/b\\/ar/*.*');
    scan('aa/bb/ba\\+z/b\\*ar/*.*');

    // { input: 'foo/**/{,/**}/bar/[^\\/]*?/*.baz',
    //   string: 'foo/**/{,/**}/bar/[^\\/]*?/*.baz',
    //   index: 30,
    //   stash: [ 'foo', '**', '{,/**}', 'bar', '[^\\/]*?', '*.baz' ],
    //   stack: [] }


  });
});
