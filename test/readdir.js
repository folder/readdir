'use strict';

require('mocha');
const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;
const write = require('write');
const rimraf = require('rimraf');
const _readdir = require('..');

const readdir = (...args) => {
  return _readdir(...args).then(files => {
    for (let i = 0; i < files.length; i++) {
      if (typeof files[i] === 'string') {
        files[i] = files[i].replace(/\\/g, '/');
      }
    }
    return files;
  });
};

const options = { ignore: ['.DS_Store', 'Thumbs.db'] };
const temp = (...args) => path.resolve(__dirname, 'temp', ...args);
const unlinkSync = filepath => rimraf.sync(filepath);
let cleanup = () => {};

const createFiles = names => {
  if (!names) return () => {};
  const paths = names.map(name => temp(name));
  paths.forEach(fp => write.sync(fp, 'temp'));
  return () => paths.forEach(file => unlinkSync(file));
};

const cleanupTemp = () => {
  if (fs.existsSync(temp())) {
    for (const file of fs.readdirSync(temp())) {
      unlinkSync(temp(file));
    }
  }
};

const createSymlink = (type, name, files) => {
  const cleanup = createFiles(files);
  const dest = temp(name);
  const src = type === 'file' ? __filename : __dirname;
  fs.symlinkSync(src, dest, type);

  return () => {
    unlinkSync(dest);
    cleanup();
  };
};

const createSymlinks = (type, names, files) => {
  const cleanup = createFiles(files);
  const fns = names.map(name => createSymlink(type, name));

  return () => {
    fns.forEach(fn => fn());
    cleanup();
  };
};

describe('readdir', () => {
  process.on('exit', cleanupTemp);
  beforeEach(() => cleanupTemp());
  beforeEach(() => rimraf.sync(path.join(__dirname, 'symlinks')));
  after(() => rimraf.sync(path.join(__dirname, 'symlinks')));
  after(() => cleanupTemp());

  describe('no options', () => {
    it('should read files in a directory and return a promise with files', cb => {
      readdir(__dirname)
        .then(files => {
          assert(files.some(file => path.basename(file) === 'readdir.js'));
          assert(files.some(file => path.basename(file) === 'fixtures'));
          cb();
        });
    });

    it('should read only one level by default', () => {
      cleanup = createFiles(['a/a/a', 'a/a/b', 'a/a/c']);

      return readdir(temp())
        .then(files => {
          cleanup();
          assert.equal(files.length, 1);
          assert.equal(files[0], 'a');
        });
    });

    it('should take and array of directories', () => {
      cleanup = createFiles(['a/a/a', 'b/b/b']);

      return readdir([temp('a'), temp('b')])
        .then(files => {
          cleanup();
          files.sort();
          assert.equal(files.length, 2);
          assert.equal(files[0], 'a');
          assert.equal(files[1], 'b');
        });
    });
  });

  describe('options.depth', () => {
    it('should recursively read files (depth: 2)', () => {
      cleanup = createFiles(['a/b/c/d/e', 'a/a/b/c/d']);

      return readdir(temp(), { depth: 2 })
        .then(files => {
          cleanup();
          files.sort();
          assert.deepEqual(files, [ 'a', 'a/a', 'a/b' ].sort());
        });
    });

    it('should recursively read files (depth: 3)', () => {
      cleanup = createFiles(['a/b/c/d/e', 'a/a/b/c/d']);

      return readdir(temp(), { depth: 3 })
        .then(files => {
          cleanup();
          files.sort();
          assert.deepEqual(files, [ 'a', 'a/a', 'a/a/b', 'a/b', 'a/b/c' ].sort());
        });
    });

    it('should recursively read files (depth: 4)', () => {
      cleanup = createFiles(['a/b/c/d/e', 'a/a/b/c/d']);

      return readdir(temp(), { depth: 4 })
        .then(files => {
          cleanup();
          files.sort();
          assert.deepEqual(files, [ 'a', 'a/a', 'a/a/b', 'a/a/b/c', 'a/b', 'a/b/c', 'a/b/c/d' ].sort());
        });
    });

    it('should recursively read files (depth: 5)', () => {
      cleanup = createFiles(['a/b/c/d/e', 'a/a/b/c/d']);
      const expected = [ 'a', 'a/a', 'a/a/b', 'a/a/b/c', 'a/b', 'a/b/c', 'a/b/c/d', 'a/b/c/d/e', 'a/a/b/c/d' ];

      return readdir(temp(), { depth: 5 })
        .then(files => {
          cleanup();
          files.sort();
          assert.deepEqual(files, expected.sort());
        });
    });
  });

  describe('options.recurse', () => {
    it('should recursively read files', () => {
      cleanup = createFiles(['a/a/a', 'a/a/b', 'a/a/c']);

      return readdir(temp(), { recursive: true })
        .then(files => {
          cleanup();
          files.sort();
          assert.deepEqual(files, [ 'a', 'a/a', 'a/a/a', 'a/a/b', 'a/a/c' ].sort());
        });
    });

    it('should get first level symlinks by default', () => {
      const paths = ['a/a/a', 'a/a/b', 'a/a/c'];
      const links = ['b/a/a', 'b/a/b', 'b/a/c'];
      cleanup = createFiles(paths);

      for (let i = 0; i < links.length; i++) {
        fs.mkdirSync(path.dirname(temp(links[i])), { recursive: true });
        fs.symlinkSync(temp(paths[i]), temp(links[i]), 'file');
      }

      return readdir(temp(), { recursive: true })
        .then(result => {
          cleanup();
          result.sort();
          assert.deepEqual(result, [ 'a', 'b', 'a/a', 'b/a', ...paths, ...links ].sort());
        });
    });
  });

  describe('options.objects', () => {
    it('should return file objects', () => {
      return readdir(__dirname, { objects: true })
        .then(files => {
          assert(files.some(file => file.name === 'readdir.js'));
          assert(files.some(file => file.name === 'fixtures'));
        });
    });
  });

  describe('options.onFile', () => {
    it('should call options.onFile function on each file', () => {
      const onFile = file => {
        if (file.name === 'readdir.js') {
          file.path = path.join(path.dirname(file.path), 'foo.js');
          file.name = 'foo.js';
        }
        return file;
      };

      return readdir(__dirname, { onFile })
        .then(files => {
          assert(files.some(file => path.basename(file) === 'foo.js'));
          assert(files.some(file => path.basename(file) === 'fixtures'));
        });
    });

    it('should not keep files when file.keep is false', () => {
      const paths = ['a/a/a.md', 'a/a/b.txt', 'a/a/c.md', 'a/b/c/d.txt', 'a/b/b/b.md'];
      cleanup = createFiles(paths);

      const onFile = file => {
        file.keep = path.extname(file.path) === '.md';
      };

      return readdir(temp(), { onFile, nodir: true, recursive: true })
        .then(files => {
          cleanup();
          assert.deepEqual(files, [ 'a/a/a.md', 'a/a/c.md', 'a/b/b/b.md' ]);
        });
    });
  });

  describe('options.onDirectory', () => {
    it('should call options.onDirectory function on each directory', () => {
      const onDirectory = file => {
        if (file.name === 'fixtures') {
          file.path = path.join(path.dirname(file.path), 'actual');
          file.name = 'actual';
        }
      };

      return readdir(__dirname, { onDirectory })
        .then(files => {
          assert(files.some(file => path.basename(file) === 'readdir.js'));
          assert(files.some(file => path.basename(file) === 'actual'));
        });
    });

    it('should not recurse in a directory when file.recurse is false', () => {
      const paths = ['a/a/a.txt', 'a/a/b.txt', 'a/a/c.txt', 'a/b/c/d.txt', 'a/b/b/b.txt'];
      cleanup = createFiles(paths);

      const onDirectory = file => {
        file.recurse = file.name !== 'b';
        file.keep = false;
      };

      return readdir(temp(), { recursive: true, onDirectory })
        .then(files => {
          cleanup();
          assert.deepEqual(files, [ 'a/a/a.txt', 'a/a/b.txt', 'a/a/c.txt' ]);
        });
    });
  });

  describe('options.symlinks', () => {
    it('should get first level symlinks by default', async () => {
      const link = 'temp-symlink.js';
      cleanup = createSymlink('file', link, ['foo.js', 'bar.js']);

      return readdir(temp(), { ...options, basename: true })
        .then(files => {
          assert(files.length > 0);
          assert(files.some(name => name === link));
          assert(files.some(name => name === 'foo.js'));
          assert(files.some(name => name === 'bar.js'));
        });
    });

    it('should not get first-level symlinks when disabled', () => {
      const paths = ['nested/a/a/a', 'nested/a/a/b', 'nested/a/a/c'];
      const links = ['nested/b/a/a', 'nested/b/a/b', 'nested/b/a/c'];
      cleanup = createFiles(paths);

      for (let i = 0; i < links.length; i++) {
        fs.mkdirSync(path.dirname(temp(links[i])), { recursive: true });
        fs.symlinkSync(temp(paths[i]), temp(links[i]), 'file');
      }

      fs.symlinkSync(temp('nested'), temp('symlinks'), 'dir');

      return readdir(temp(), { recursive: true, symlinks: false })
        .then(files => {
          cleanup();
          unlinkSync(temp('symlinks'));

          assert(files.includes('nested'));
          assert(files.includes('nested/a'));
          assert(files.includes('nested/b'));
          assert(files.includes('nested/a/a'));
          assert(files.includes('nested/a/a/a'));

          assert(!files.includes('symlinks'));
          assert(!files.includes('symlinks/a'));
          assert(!files.includes('symlinks/b'));
          assert(!files.includes('symlinks/a/a'));
          assert(!files.includes('symlinks/a/a/a'));
        });
    });

    it('should return symlinked files when not disabled on options', async () => {
      try {
        const link = 'temp-symlink.js';
        cleanup = createSymlink('file', link, ['foo.js', 'bar.js']);

        const files = await readdir(temp(), { ...options });

        assert(files.length > 0);
        assert(files.some(name => name === link));
        assert(files.some(name => name === 'foo.js'));
        assert(files.some(name => name === 'bar.js'));

      } catch (err) {
        return Promise.reject(err);
      } finally {
        cleanup();
      }
    });

    it('should return symlinked directories when not disabled on options', async () => {
      const opts = { ...options, basename: true };

      try {
        const link = 'temp-symlink';
        cleanup = createSymlink('dir', link, ['foo.js', 'bar.js']);

        const files = await readdir(temp(), opts);

        assert(files.length > 0);
        assert(files.some(name => name === link));
        assert(files.some(name => name === 'foo.js'));
        assert(files.some(name => name === 'bar.js'));

      } catch (err) {
        return Promise.reject(err);
      } finally {
        cleanup();
      }
    });

    it('should ignore nested symlinked files that do not exist', async () => {
      const opts = { ...options, symlinks: true };

      cleanup = createFiles(['foo.js', 'bar.js']);
      const tempfile = temp('tempfile.js');
      const link = temp('link.js');

      try {
        write.sync(tempfile, 'temp');
        fs.symlinkSync(tempfile, link, 'file');
        unlinkSync(tempfile);

        const files = await readdir(temp(), opts);

        assert(files.length > 0);
        assert(!files.some(name => name === link));
        assert(files.some(name => name === 'foo.js'));
        assert(files.some(name => name === 'bar.js'));

      } catch (err) {
        return Promise.reject(err);
      } finally {
        cleanup();
        unlinkSync(link);
      }
    });

    it('should ignore nested symlinked directories that do not exist', async () => {
      const opts = { ...options, symlinks: true };
      cleanup = createFiles(['foo.js', 'bar.js']);

      const tempdir = temp('tempdir/a/b/c');
      const link = temp('link');

      try {
        fs.mkdirSync(tempdir, { recursive: true });
        fs.symlinkSync(tempdir, link, 'dir');
        rimraf.sync(tempdir);

        const files = await readdir(temp(), opts);

        assert(files.length > 0);
        assert(!files.some(name => name === link));
        assert(files.some(name => name === 'foo.js'));
        assert(files.some(name => name === 'bar.js'));

      } catch (err) {
        return Promise.reject(err);
      } finally {
        cleanup();
        unlinkSync(link);
      }
    });

    it('should only get first-level symlinks by default', () => {
      const paths = ['nested/a/a/a', 'nested/a/a/b', 'nested/a/a/c'];
      const links = ['nested/b/a/a', 'nested/b/a/b', 'nested/b/a/c'];
      cleanup = createFiles(paths);

      for (let i = 0; i < links.length; i++) {
        fs.mkdirSync(path.dirname(temp(links[i])), { recursive: true });
        fs.symlinkSync(temp(paths[i]), temp(links[i]), 'file');
      }

      fs.symlinkSync(temp('nested'), temp('symlinks'), 'dir');

      return readdir(temp(), { recursive: true })
        .then(files => {
          cleanup();
          unlinkSync(temp('symlinks'));

          assert(files.includes('nested'));
          assert(files.includes('nested/a'));
          assert(files.includes('nested/b'));
          assert(files.includes('nested/a/a'));
          assert(files.includes('nested/a/a/a'));

          assert(files.includes('symlinks'));
          assert(!files.includes('symlinks/a'));
          assert(!files.includes('symlinks/b'));
          assert(!files.includes('symlinks/a/a'));
          assert(!files.includes('symlinks/a/a/a'));
        });
    });

    it('should recursively get symlinks when specified', () => {
      const paths = ['nested/a/a/a', 'nested/a/a/b', 'nested/a/a/c'];
      const links = ['nested/b/a/a', 'nested/b/a/b', 'nested/b/a/c'];
      cleanup = createFiles(paths);

      for (let i = 0; i < links.length; i++) {
        fs.mkdirSync(path.dirname(temp(links[i])), { recursive: true });
        fs.symlinkSync(temp(paths[i]), temp(links[i]), 'file');
      }

      fs.symlinkSync(temp('nested'), temp('symlinks'), 'dir');

      return readdir(temp(), { recursive: true, follow: true })
        .then(files => {
          cleanup();
          unlinkSync(temp('symlinks'));

          assert(files.includes('nested'), 'should match nested');
          assert(files.includes('nested/a'), 'should match nested/a');
          assert(files.includes('nested/b'), 'should match nested/b');
          assert(files.includes('nested/a/a'), 'should match nested/a/a');
          assert(files.includes('nested/a/a/a'), 'should match nested/a/a/a');

          assert(files.includes('symlinks'), 'should match symlinks');
          assert(files.includes('symlinks/a'), 'should match symlinks/a');
          assert(files.includes('symlinks/b'), 'should match symlinks/b');
          assert(files.includes('symlinks/a/a'), 'should match symlinks/a/a');
          assert(files.includes('symlinks/a/a/a'), 'should match symlinks/a/a/a');
        });
    });
  });

  describe('options.unique', () => {
    it('should not return duplicates', () => {
      cleanup = createFiles(['a/a/a', 'a/a/b', 'a/a/c']);

      return readdir([temp(), temp(), temp('a'), temp(), temp(), temp('a')], { unique: true, recursive: true })
        .then(files => {
          cleanup();
          assert(files.length > 1);
          assert(files.includes('a/a/a'));
          assert(files.includes('a/a/b'));
          assert(files.includes('a/a/c'));
          files.sort();

          const unique = [...new Set(files)].join('');
          assert.equal(files.join(''), unique);
        });
    });

    it('should not return duplicates when "objects" is true', () => {
      cleanup = createFiles(['a/a/a', 'a/a/b', 'a/a/c']);

      return readdir([temp(), temp(), temp('a'), temp(), temp(), temp('a')], {
        objects: true,
        recursive: true,
        unique: true
      })
        .then(files => {
          cleanup();
          assert(files.length > 1);

          const paths = files.map(file => file.relative.replace(/\\/g, '/'));
          assert(paths.length > 1);
          assert(paths.includes('a/a/a'));
          assert(paths.includes('a/a/b'));
          assert(paths.includes('a/a/c'));
          paths.sort();

          const unique = [...new Set(paths)].join('');
          assert.equal(paths.join(''), unique);
        });
    });
  });

  describe('options.realpath', () => {
    it('should return realpaths', () => {
      const paths = ['a/a/a', 'a/a/b', 'a/a/c'];
      const links = ['b/a/a', 'b/a/b', 'b/a/c'];
      cleanup = createFiles(paths);

      for (let i = 0; i < links.length; i++) {
        fs.mkdirSync(path.dirname(temp(links[i])), { recursive: true });
        fs.symlinkSync(temp(paths[i]), temp(links[i]), 'file');
      }

      return readdir(temp(), { recursive: true, realpath: true })
        .then(files => {
          cleanup();
          assert.deepEqual(files.sort(), [ 'a', 'b', 'a/a', 'b/a', ...paths, ...paths ].sort());
        });
    });

    it('should return realpaths with no duplicates when options.unique is true', () => {
      const paths = ['a/a/a', 'a/a/b', 'a/a/c'];
      const links = ['b/a/a', 'b/a/b', 'b/a/c'];
      cleanup = createFiles(paths);

      for (let i = 0; i < links.length; i++) {
        fs.mkdirSync(path.dirname(temp(links[i])), { recursive: true });
        fs.symlinkSync(temp(paths[i]), temp(links[i]), 'file');
      }

      return readdir(temp(), { recursive: true, realpath: true, unique: true })
        .then(files => {
          cleanup();
          assert.deepEqual(files.sort(), [ 'a', 'b', 'a/a', 'b/a', ...paths ].sort());
        });
    });
  });

  describe('options.relative', () => {
    it('should get relative paths for symlinked files', async () => {
      const opts = { ...options, relative: true, symlinks: true, base: __dirname };
      const names = fs.readdirSync(path.join(__dirname, '..'));

      cleanup = createSymlinks('file', names, ['foo.js', 'bar.js']);

      return readdir(temp(), opts)
        .then(files => {
          cleanup();
          assert(files.length > 0);

          // symlinks
          assert(files.some(name => name === 'temp/README.md'));
          assert(files.some(name => name === 'temp/LICENSE'));

          // files
          assert(files.some(name => name === 'temp/foo.js'));
          assert(files.some(name => name === 'temp/bar.js'));
        })
        .catch(err => {
          cleanup();
          return Promise.reject(err);
        });
    });

    it('should get relative paths for symlinked files', () => {
      const opts = { ...options, relative: true, symlinks: true, base: __dirname };
      const names = fs.readdirSync(path.join(__dirname, '..'));

      cleanup = createSymlinks('file', names, ['foo.js', 'bar.js']);

      return readdir(temp(), opts)
        .then(files => {
          cleanup();
          assert(files.length > 0);
          // symlinks
          assert(files.some(name => name === 'temp/README.md'));
          assert(files.some(name => name === 'temp/LICENSE'));

          // files
          assert(files.some(name => name === 'temp/foo.js'));
          assert(files.some(name => name === 'temp/bar.js'));
        })
        .catch(err => {
          cleanup();
          return Promise.reject(err);
        });
    });
  });

  describe('options.isMatch', () => {
    const opts = { ...options, relative: true, symlinks: true, base: __dirname };

    it('should match symlinks with a function', async () => {
      try {
        const names = fs.readdirSync(path.join(__dirname, '..'));
        cleanup = createSymlinks('file', names, ['foo.js', 'bar.js']);

        const isMatch = file => !/license/i.test(file.path);
        const files = await readdir(temp(), { ...opts, isMatch });

        assert(files.length > 0);
        // symlinks
        assert(files.some(name => name === 'temp/README.md'));
        assert(!files.some(name => name === 'temp/LICENSE'));

        // files
        assert(files.some(name => name === 'temp/foo.js'));
        assert(files.some(name => name === 'temp/bar.js'));

      } catch (err) {
        return Promise.reject(err);
      } finally {
        cleanup();
      }
    });

    it('should match files with a function', () => {
      const isMatch = file => /sync/.test(file.path);

      return readdir(__dirname, { ...opts, isMatch })
        .then(files => {
          assert(files.includes('readdir.sync.js'));
          assert(!files.includes('readdir.js'));
        });
    });

    it('should match files recursively with a function', async () => {
      cleanup = createFiles(['c.md', 'a/a/a/a.md', 'a/a/a/c.txt', 'a/a/a/b.md', 'a/b.txt']);

      const isMatch = file => {
        return file.isFile() && path.extname(file.path) === '.md';
      };

      return readdir(temp(), { recursive: true, isMatch })
        .then(files => {
          cleanup();
          assert.deepEqual(files, [ 'c.md', 'a/a/a/a.md', 'a/a/a/b.md' ]);
        });
    });

    it('should match files with a regex', () => {
      return readdir(__dirname, { ...opts, isMatch: /sync/ })
        .then(files => {
          assert(files.includes('readdir.sync.js'));
          assert(!files.includes('readdir.js'));
        });
    });

    it('should match files with an array', () => {
      return readdir(__dirname, { ...opts, isMatch: [/sync/] })
        .then(files => {
          assert(files.includes('readdir.sync.js'));
          assert(!files.includes('readdir.js'));
        });
    });
  });
});
