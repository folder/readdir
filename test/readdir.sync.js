'use strict';

require('mocha');
const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;
const write = require('write');
const rimraf = require('rimraf');
const readdir = require('..');

const unixify = input => input.replace(/\\/g, '/');

const readdirSync = (...args) => {
  const files = readdir.sync(...args);

  return files.map(file => {
    return typeof file === 'string' ? unixify(file) : file;
  });
};

const options = { ignore: ['.DS_Store', 'Thumbs.db'] };
const temp = (...args) => unixify(path.resolve(__dirname, 'temp', ...args));
const unlinkSync = filepath => rimraf.sync(filepath, { glob: false });
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

describe('readdir.sync', () => {
  process.on('exit', cleanupTemp);
  beforeEach(() => cleanupTemp());
  beforeEach(() => rimraf.sync(path.join(__dirname, 'symlinks')));
  after(() => rimraf.sync(path.join(__dirname, 'symlinks')));
  after(() => cleanupTemp());

  describe('no options', () => {
    it('should read files in a directory and return a promise with files', () => {
      const files = readdirSync(__dirname);
      assert(files.some(file => path.basename(file) === 'readdir.js'));
      assert(files.some(file => path.basename(file) === 'fixtures'));
    });

    it('should return an array of files', () => {
      const files = readdirSync(__dirname);
      assert(files.some(file => file === 'readdir.js'));
      assert(files.some(file => file === 'readdir.sync.js'));
      assert(files.some(file => file === 'fixtures'));
    });

    it('should call options.onFile on each file', () => {
      const files = readdirSync(__dirname, {
        objects: true,
        onFile(file) {
          if (file.name === 'readdir.js') {
            file.stem = 'foo';
          }
          return file;
        }
      });

      assert(files.some(f => f.stem === 'foo' && f.name === 'readdir.js'));
    });

    it('should read only one level by default', () => {
      cleanup = createFiles(['a/a/a', 'a/a/b', 'a/a/c']);

      const files = readdirSync(temp());
      cleanup();
      assert.equal(files.length, 1);
      assert.equal(files[0], 'a');
    });

    it('should take and array of directories', () => {
      cleanup = createFiles(['a/a/a', 'b/b/b']);

      const files = readdirSync([temp('a'), temp('b')]);
      cleanup();
      assert.equal(files.length, 2);
      assert.equal(files[0], 'a');
      assert.equal(files[1], 'b');
    });
  });

  describe('options.depth', () => {
    it('should recursively read files (depth: 2)', () => {
      cleanup = createFiles(['a/b/c/d/e', 'a/a/b/c/d']);

      const files = readdirSync(temp(), { depth: 2 });
      cleanup();
      files.sort();
      assert.deepEqual(files, [ 'a', 'a/a', 'a/b' ].sort());
    });

    it('should recursively read files (depth: 3)', () => {
      cleanup = createFiles(['a/b/c/d/e', 'a/a/b/c/d']);
      const files = readdirSync(temp(), { depth: 3 });

      files.sort();
      assert.deepEqual(files, [ 'a', 'a/a', 'a/a/b', 'a/b', 'a/b/c' ].sort());
    });

    it('should recursively read files (depth: 4)', () => {
      cleanup = createFiles(['a/b/c/d/e', 'a/a/b/c/d']);

      const files = readdirSync(temp(), { depth: 4 });
      cleanup();
      files.sort();
      assert.deepEqual(files, [ 'a', 'a/a', 'a/a/b', 'a/a/b/c', 'a/b', 'a/b/c', 'a/b/c/d' ].sort());
    });

    it('should recursively read files (depth: 5)', () => {
      cleanup = createFiles(['a/b/c/d/e', 'a/a/b/c/d']);
      const expected = [ 'a', 'a/a', 'a/a/b', 'a/a/b/c', 'a/b', 'a/b/c', 'a/b/c/d', 'a/b/c/d/e', 'a/a/b/c/d' ];

      const files = readdirSync(temp(), { depth: 5 });
      cleanup();
      files.sort();
      assert.deepEqual(files, expected.sort());
    });
  });

  describe('options.dot', () => {
    it('should exclude dot files when dot is false', () => {
      const expected = ['a', 'a/a', 'a/a/a', 'a/a/b', 'a/a/c', '.gitignore', '.DS_Store'];
      cleanup = createFiles(['a/a/a', 'a/a/b', 'a/a/c', '.gitignore', '.DS_Store']);

      const files1 = readdirSync(temp(), { recursive: true });
      files1.sort();

      expected.forEach(pathname => assert(files1.includes(pathname), pathname));

      const files2 = readdirSync(temp(), { recursive: true, dot: false });
      files2.sort();

      expected.forEach(pathname => {
        if (pathname.startsWith('.')) {
          assert(!files2.includes(pathname), pathname);
        } else {
          assert(files2.includes(pathname), pathname);
        }
      });

      cleanup();
    });
  });

  describe('options.filter', () => {
    const opts = { ...options, relative: true, symlinks: true, base: __dirname };

    it('should filter symlinks', () => {
      try {
        const names = fs.readdirSync(path.join(__dirname, '..'));
        cleanup = createSymlinks('file', names, ['foo.js', 'bar.js']);

        const filter = file => !/license/i.test(file.path);
        const files = readdir.sync(temp(), { ...opts, filter });

        assert(files.length > 0);
        // symlinks
        assert(files.some(name => name === 'temp/README.md'));
        assert(!files.some(name => name === 'temp/LICENSE'));

        // files
        assert(files.some(name => name === 'temp/foo.js'));
        assert(files.some(name => name === 'temp/bar.js'));
        cleanup();

      } catch (err) {
        cleanup();
        throw err;
      }
    });

    it('should filter files', () => {
      const filter = file => /sync/.test(file.path);

      const files = readdir.sync(__dirname, { ...opts, filter });
      assert(files.includes('readdir.sync.js'));
    });

    it('should filter files recursively', () => {
      cleanup = createFiles(['c.md', 'a/a/a/a.md', 'a/a/a/c.txt', 'a/a/a/b.md', 'a/b.txt']);

      const filter = file => {
        return file.isFile() && path.extname(file.path) === '.md';
      };

      const files = readdir.sync(temp(), { recursive: true, filter });
      cleanup();
      assert.deepEqual(files, [ 'c.md', 'a/a/a/a.md', 'a/a/a/b.md' ].sort());
    });
  });

  describe('options.recurse', () => {
    it('should recursively read files', () => {
      cleanup = createFiles(['a/a/a', 'a/a/b', 'a/a/c']);

      const files = readdirSync(temp(), { recursive: true });
      cleanup();
      files.sort();
      assert.deepEqual(files, [ 'a', 'a/a', 'a/a/a', 'a/a/b', 'a/a/c' ].sort());
    });

    it('should get first level symlinks by default', () => {
      const paths = ['a/a/a', 'a/a/b', 'a/a/c'];
      const links = ['b/a/a', 'b/a/b', 'b/a/c'];
      cleanup = createFiles(paths);

      for (let i = 0; i < links.length; i++) {
        fs.mkdirSync(path.dirname(temp(links[i])), { recursive: true });
        fs.symlinkSync(temp(paths[i]), temp(links[i]), 'file');
      }

      const files = readdirSync(temp(), { recursive: true });
      cleanup();
      files.sort();
      assert.deepEqual(files, [ 'a', 'b', 'a/a', 'b/a', ...paths, ...links ].sort());
    });
  });

  describe('options.objects', () => {
    it('should return file objects', () => {
      const files = readdirSync(__dirname, { objects: true });
      assert(files.some(file => file.name === 'readdir.js'));
      assert(files.some(file => file.name === 'fixtures'));
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

      const files = readdirSync(__dirname, { onFile });
      assert(files.some(file => path.basename(file) === 'foo.js'));
      assert(files.some(file => path.basename(file) === 'fixtures'));
    });

    it('should not keep files when file.keep is false', () => {
      const paths = ['a/a/a.md', 'a/a/b.txt', 'a/a/c.md', 'a/b/c/d.txt', 'a/b/b/b.md'];
      cleanup = createFiles(paths);

      const onFile = file => {
        file.keep = path.extname(file.path) === '.md';
      };

      const files = readdirSync(temp(), { onFile, nodir: true, recursive: true });
      cleanup();
      assert.deepEqual(files, [ 'a/a/a.md', 'a/a/c.md', 'a/b/b/b.md' ]);
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

      const files = readdirSync(__dirname, { onDirectory });
      assert(files.some(file => path.basename(file) === 'readdir.js'));
      assert(files.some(file => path.basename(file) === 'actual'));
    });

    it('should not recurse in a directory when file.recurse is false', () => {
      const paths = ['a/a/a.txt', 'a/a/b.txt', 'a/a/c.txt', 'a/b/c/d.txt', 'a/b/b/b.txt'];
      cleanup = createFiles(paths);

      const onDirectory = file => {
        file.recurse = file.name !== 'b';
        file.keep = false;
      };

      const files = readdirSync(temp(), { recursive: true, onDirectory });
      cleanup();
      assert.deepEqual(files, [ 'a/a/a.txt', 'a/a/b.txt', 'a/a/c.txt' ]);
    });
  });

  describe('options.symlinks', () => {
    it('should get first-level symlinks by default', () => {
      const link = 'temp-symlink.js';
      cleanup = createSymlink('file', link, ['foo.js', 'bar.js']);

      const files = readdirSync(temp(), { ...options });
      assert(files.length > 0);
      assert(files.some(name => name === link));
      assert(files.some(name => name === 'foo.js'));
      assert(files.some(name => name === 'bar.js'));
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

      const files = readdirSync(temp(), { recursive: true, symlinks: false });
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

    it('should return symlinked files when not disabled on options', () => {
      const link = 'temp-symlink.js';
      cleanup = createSymlink('file', link, ['foo.js', 'bar.js']);

      const files = readdirSync(temp(), { ...options });

      assert(files.length > 0);
      assert(files.some(name => name === link));
      assert(files.some(name => name === 'foo.js'));
      assert(files.some(name => name === 'bar.js'));
    });

    it('should return symlinked directories when not disabled on options', () => {
      const opts = { ...options };

      const link = 'temp-symlink';
      cleanup = createSymlink('dir', link, ['foo.js', 'bar.js']);

      const files = readdirSync(temp(), opts);

      assert(files.length > 0);
      assert(files.some(name => name === link));
      assert(files.some(name => name === 'foo.js'));
      assert(files.some(name => name === 'bar.js'));
    });

    it('should ignore nested symlinked files that do not exist', () => {
      const opts = { ...options, symlinks: true };

      cleanup = createFiles(['foo.js', 'bar.js']);
      const tempfile = temp('tempfile.js');
      const link = temp('link.js');

      process.on('exit', () => unlinkSync(link));

      write.sync(tempfile, 'temp');
      fs.symlinkSync(tempfile, link, 'file');
      unlinkSync(tempfile);

      const files = readdirSync(temp(), opts);

      assert(files.length > 0);
      assert(!files.some(name => name === link));
      assert(files.some(name => name === 'foo.js'));
      assert(files.some(name => name === 'bar.js'));
    });

    it('should ignore nested symlinked directories that do not exist', () => {
      const opts = { ...options, symlinks: true };
      cleanup = createFiles(['foo.js', 'bar.js']);

      const tempdir = temp('tempdir/a/b/c');
      const link = temp('link');
      process.on('exit', () => unlinkSync(link));

      fs.mkdirSync(tempdir, { recursive: true });
      fs.symlinkSync(tempdir, link, 'dir');
      rimraf.sync(tempdir);

      const files = readdirSync(temp(), opts);

      assert(files.length > 0);
      assert(!files.some(name => name === link));
      assert(files.some(name => name === 'foo.js'));
      assert(files.some(name => name === 'bar.js'));
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

      const files = readdirSync(temp(), { recursive: true });
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

    it('should recursively get symlinks when specified', () => {
      const paths = ['nested/a/a/a', 'nested/a/a/b', 'nested/a/a/c'];
      const links = ['nested/b/a/a', 'nested/b/a/b', 'nested/b/a/c'];
      cleanup = createFiles(paths);

      for (let i = 0; i < links.length; i++) {
        fs.mkdirSync(path.dirname(temp(links[i])), { recursive: true });
        fs.symlinkSync(temp(paths[i]), temp(links[i]), 'file');
      }

      fs.symlinkSync(temp('nested'), temp('symlinks'), 'dir');

      const files = readdirSync(temp(), { recursive: true, follow: true });
      cleanup();
      unlinkSync(temp('symlinks'));

      assert(files.includes('nested'));
      assert(files.includes('nested/a'));
      assert(files.includes('nested/b'));
      assert(files.includes('nested/a/a'));
      assert(files.includes('nested/a/a/a'));

      assert(files.includes('symlinks'));
      assert(files.includes('symlinks/a'));
      assert(files.includes('symlinks/b'));
      assert(files.includes('symlinks/a/a'));
      assert(files.includes('symlinks/a/a/a'));
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

      const files = readdirSync(temp(), { recursive: true, realpath: true });
      cleanup();
      assert.deepEqual(files.sort(), [ 'a', 'b', 'a/a', 'b/a', ...paths, ...paths ].sort());
    });

    it('should return realpaths with no duplicates when options.unique is true', () => {
      const paths = ['a/a/a', 'a/a/b', 'a/a/c'];
      const links = ['b/a/a', 'b/a/b', 'b/a/c'];
      cleanup = createFiles(paths);

      for (let i = 0; i < links.length; i++) {
        fs.mkdirSync(path.dirname(temp(links[i])), { recursive: true });
        fs.symlinkSync(temp(paths[i]), temp(links[i]), 'file');
      }

      const files = readdirSync(temp(), { recursive: true, realpath: true, unique: true });
      cleanup();
      assert.deepEqual(files.sort(), [ 'a', 'b', 'a/a', 'b/a', ...paths ].sort());
    });
  });

  describe('options.relative', () => {
    it('should get relative paths for symlinked files', () => {
      const opts = { ...options, relative: true, symlinks: true, base: __dirname };
      const names = fs.readdirSync(path.join(__dirname, '..'));

      cleanup = createSymlinks('file', names, ['foo.js', 'bar.js']);

      const files = readdirSync(temp(), opts);
      cleanup();
      assert(files.length > 0);
      // symlinks
      assert(files.some(name => name === 'temp/README.md'));
      assert(files.some(name => name === 'temp/LICENSE'));

      // files
      assert(files.some(name => name === 'temp/foo.js'));
      assert(files.some(name => name === 'temp/bar.js'));
    });

    it('should get relative paths for symlinked files', () => {
      const opts = { ...options, relative: true, symlinks: true, base: __dirname };
      const names = fs.readdirSync(path.join(__dirname, '..'));

      cleanup = createSymlinks('file', names, ['foo.js', 'bar.js']);

      const files = readdirSync(temp(), opts);
      cleanup();
      assert(files.length > 0);
      // symlinks
      assert(files.some(name => name === 'temp/README.md'));
      assert(files.some(name => name === 'temp/LICENSE'));

      // files
      assert(files.some(name => name === 'temp/foo.js'));
      assert(files.some(name => name === 'temp/bar.js'));
    });
  });

  describe('options.isMatch', () => {
    const opts = { ...options, relative: true, symlinks: true, base: __dirname };

    it('should match symlinks', () => {
      const names = fs.readdirSync(path.join(__dirname, '..'));
      cleanup = createSymlinks('file', names, ['foo.js', 'bar.js']);

      const isMatch = file => !/license/i.test(file.path);
      const files = readdirSync(temp(), { ...opts, isMatch });

      assert(files.length > 0);
      // symlinks
      assert(files.some(name => name === 'temp/README.md'));
      assert(!files.some(name => name === 'temp/LICENSE'));

      // files
      assert(files.some(name => name === 'temp/foo.js'));
      assert(files.some(name => name === 'temp/bar.js'));
    });

    it('should match files', () => {
      const isMatch = file => /sync/.test(file.path);

      const files = readdirSync(__dirname, { ...opts, isMatch });
      assert(files.includes('readdir.sync.js'));
    });

    it('should match files recursively', () => {
      cleanup = createFiles(['c.md', 'a/a/a/a.md', 'a/a/a/c.txt', 'a/a/a/b.md', 'a/b.txt']);

      const isMatch = file => {
        return file.isFile() && path.extname(file.path) === '.md';
      };

      const files = readdirSync(temp(), { recursive: true, isMatch });
      cleanup();

      assert.deepEqual(files, ['c.md', 'a/a/a/a.md', 'a/a/a/b.md'].sort());
    });

    it('should keep matching files', () => {
      cleanup = createFiles(['b/b/b.txt', 'a/a/a.txt', 'c/c/c.txt']);

      const isMatch = file => {
        return file.name !== 'b.txt';
      };

      const files = readdirSync('test/temp', { absolute: true, recursive: true, isMatch });

      cleanup();
      assert(files.length > 1);
      assert(files.includes(temp('a/a/a.txt')));
      assert(!files.includes(temp('b/b/b.txt')));
      assert(files.includes(temp('c/c/c.txt')));
    });

    it('should keep matching directories', () => {
      cleanup = createFiles(['bb/b/b', 'aa/a/a', 'cc/c/c']);

      const isMatch = file => {
        return !file.relative.startsWith('bb');
      };

      const files = readdirSync('test/temp', { absolute: true, recursive: true, isMatch });

      cleanup();
      assert(files.length > 1);
      assert(files.includes(temp('aa/a/a')));
      assert(!files.includes(temp('bb/b/b')));
      assert(files.includes(temp('cc/c/c')));
    });
  });
});
