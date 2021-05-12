# @folder/readdir [![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://paypal.me/jonathanschlinkert?locale.x=en_US) [![NPM version](https://img.shields.io/npm/v/@folder/readdir.svg?style=flat)](https://www.npmjs.com/package/@folder/readdir) [![NPM monthly downloads](https://img.shields.io/npm/dm/@folder/readdir.svg?style=flat)](https://npmjs.org/package/@folder/readdir) [![NPM total downloads](https://img.shields.io/npm/dt/@folder/readdir.svg?style=flat)](https://npmjs.org/package/@folder/readdir)

> Recursively read a directory, blazing fast.

Please consider following this project's author, [Jon Schlinkert](https://github.com/jonschlinkert), and consider starring the project to show your :heart: and support.

## Install

Install with [npm](https://www.npmjs.com/) (requires [Node.js](https://nodejs.org/en/) >=10):

```sh
$ npm install --save @folder/readdir
```

## Why use @folder/readdir and not some other lib?

* It's [blazing fast](#benchmarks).
* It has a simple, [straightforward API](#usage) and intuitive [options](#options) for advanced use cases.
* Optionally returns an array of file objects (extends node.js native [fs.Dirent](https://nodejs.org/api/fs.html#fs_class_fs_dirent)). Returns path strings by default.
* No dependencies

## Usage

```js
const readdir = require('@folder/readdir');
const options = {};

// async usage
console.log(await readdir('somedir', options));
console.log(await readdir(['two', 'dirs'], options));

// sync usage
console.log(readdir.sync('somedir', options));
console.log(readdir.sync(['two' 'dirs'], options));
```

**params**

Both the async and sync functions take the same arguments:

```js
readdir(dir, options);
```

* `dir` (string|array) - one or more directories to read
* `options` - see available [options](#options)

## Options

### absolute

When true, absolute paths are returned. Otherwise, returned paths are relative to [options.base](#base) if defined, or the given directory.

**Type**: `boolean`

**Default**: `undefined`

**Example**

```js
console.log(await readdir('some/dir', { absolute: true }));
```

### base

The base directory from which relative paths should be created.

**Type**: `string`

**Default**: Defaults to the directory passed as the first argument.

**Example**

```js
const files = await readdir('some/dir', { base: 'dir' });
console.log(files);
```

### basename

When true, only the basename of each file is returned.

**Type**: `boolean`

**Default**: `undefined`

**Example**

```js
console.log(await readdir('some/dir', { basename: true }));
```

### depth

The maximum folder depth to recursively read directories.

**Type**: `number`

**Default**: `undefined`

**Example**

```js
const files = await readdir('some/dir', { depth: 2 });
console.log(files);
```

### dot

Dotfiles are included in the result by default. Pass `false` to ignore all dotfiles. Use [onEach][], [onFile][], [onDirectory][], or [isMatch] if you need something more granular.

**Type**: `boolean`

**Default**: `true`

**Example**

```js
const files = await readdir('.');
console.log(files);
//=> ['.DS_Store', '.git', 'LICENSE', 'README.md', 'package.json']

const files = await readdir('.', { dot: false });
console.log(files);
//=> ['LICENSE', 'README.md', 'package.json']
```

### filter

**Type**: `function|string|array|regexp`

**Default**: `undefined`

**Example**

```js
// only return file paths with "foo" somewhere in the path
console.log(await readdir('some/dir', { filter: /foo/ }));

// only return file paths without "foo" somewhere in the path
console.log(await readdir('some/dir', { filter: file => !/foo/.test(file.path) }));
```

### follow

Follow symbolic links.

**Type**: `boolean`

**Default**: `undefined`

**Example**

```js
console.log(await readdir('some/dir', { follow: true }));
```

### isMatch

**Type**: `function|string|regex|array<function|string|regex>`

**Default**: `undefined`

**Example**

```js
// only return file paths with "/.git/" somewhere in the path
console.log(await readdir('some/dir', { isMatch: /\/\.git\// }));

// only return file paths that are not inside "node_modules"
console.log(await readdir('some/dir', { isMatch: file => !file.relative.includes('node_modules') }));

// get all files that are not named .DS_Store
console.log(await readdir('some/dir', { isMatch: file => file.name !== '.DS_Store' }));

// use globs
const picomatch = require('picomatch');
const isMatch = picomatch('*/*.js');
console.log(await readdir('some/dir', { isMatch: file => isMatch(file.relative) }));
```

### nodir

When `true` directories are excluded from the result.

**Type**: `boolean`

**Default**: `undefined`

### objects

Return [fs.Dirent](https://nodejs.org/api/fs.html#fs_class_fs_dirent) objects instead of paths.

**Type**: `boolean`

**Default**: `undefined`

```js
console.log(await readdir('some/dir', { objects: true }));
```

### onDirectory

Function to be called on all directories.

**Type**: `function`

**Default**: `undefined`

**Example**

```js
const onDirectory = file => {
  if (file.name === 'node_modules') {
    file.recurse = false;
  }
};
console.log(await readdir('some/dir', { onDirectory }));
```

### onEach

Function to be called on all directories and files.

**Type**: `function`

**Default**: `undefined`

**Example**

```js
const onEach = file => {
  if (file.name === 'node_modules') {
    file.recurse = false;
  }
  if (file.isFile() && file.name[0] === '.') {
    file.keep = true;
  }
};
console.log(await readdir('some/dir', { onEach }));
```

### onFile

Function to be called on all files.

**Type**: `function`

**Default**: `undefined`

**Example**

```js
const onFile = file => {
  if (file.isFile() && file.name[0] === '.') {
    file.keep = true;
  }
};
console.log(await readdir('some/dir', { onFile }));
```

### onSymbolicLink

Function to be called on all symbolic links.

**Type**: `function`

**Default**: `undefined`

**Example**

```js
const onSymbolicLink = file => {
  // do stuff
};
console.log(await readdir('some/dir', { onSymbolicLink }));
```

### realpath

When true, the realpath of the file is returned in the result. This can be used in combination with other options, like `basename` or `relative`.

**Type**: `boolean`

**Default**: `undefined`

**Example**

```js
console.log(await readdir('some/dir', { realpath: true }));
```

### recursive

**Type**: `function`

**Type**: `string`

**Type**: `boolean`

**Default**: `undefined`

**Example**

```js
const files = await readdir('some/dir', { recursive: true });
console.log(files);
```

### symlinks

Returns the first directory level of symbolic links. Use [options.follow](#follow) to recursively follow symlinks.

**Type**: `boolean`

**Default**: `undefined`

**Example**

```js
console.log(await readdir('some/dir', { symlinks: true }));
```

### unique

Return only unique file paths. Only needed when [options.realpath](#realpath) is `true`.

**Type**: `boolean`

**Default**: `undefined`

**Example**

```js
console.log(await readdir('some/dir', { unique: true }));
```

## Tips & Tricks

Use the [onFile](#onFile) option to operate on files as they are read from the file system, before they are pushed onto the results array.

This allows you to pricisely control which files are returned.

_(Note that even when you specify that files should be returned as _paths_ rather than objects, all functions passed on the options will receive files as objects, so that you may manipulate the paths that are returned however you need to)_

```js
const readdir = require('@folder/readdir');
const isMatch = file => true;

module.exports = async (dir, options) => {
  const opts = { absolute: true, recursive: true, objects: true, ...options };
  const files = [];

  const onFile = file => {
    if (isMatch(file)) {
      files.push(file);
    }
  };

  await readdir(dir, { ...opts, onFile });
  return files;
};
```

**Files and directories**

The `onFile` option does not receive dir objects, only dirents (files). If you need both files and directories, you can do the following:

```js
const readdir = require('@folder/readdir');
const isMatch = file => true;

module.exports = async (dir, options) => {
  const opts = { recursive: true, objects: true, ...options };
  const files = [];

  const onDirectory = file => {
    if (file.name === 'node_modules') {
      file.recurse = false;
    }
  };

  const onFile = file => {
    if (isMatch(file)) {
      files.push(file);
    }
  };

  await readdir(dir, { ...opts, onFile, onDirectory });
  return files;
};
```

Or you can use [onEach](#onEach) (which gives you each file before it has been determined whether or not the file will be returned based on other criteria and options. this allows you to override default behavior in a granular way), or [onPush](#onPush) (which gives you a file that is going to be returned in the results array).

Here, we only show `onEach`, since it's identical to `onPush` in terms of usage.

```js
const readdir = require('@folder/readdir');

const ignore = ['node_modules', '.git'];
const isIgnored = file => ignore.includes(file.nane);

module.exports = async (dir, options) => {
  const opts = { recursive: true, objects: true, ...options };
  const files = [];

  const onEach = file => {
    if (file.isDirectory()) {
      file.recurse = !isIgnored(file);
    } else {
      files.push(file);
    }
  };

  await readdir(dir, { ...opts, onFile, onEach });
  return files;
};
```

## Benchmarks

_(Note that only the benchmarks against `fdir` are included here since that library claims to be the fastest)_

To run the benchmarks yourself, you'll need to cd into the `bench` folder and run `$ npm i`. Run the `recursive-large` benchmarks last, and before you run them cd into `bench/fixtures` and do `$ npm i`.

**Specs**

* CPU: Intel® Core™ i9-9980HK 2.4GHz
* Cores: 16 (8 Physical)
* RAM: 64GB
* Disk: Apple APPLE SSD AP2048N 1864GB NVMe (PCIe x4)
* OS: macOS macOS Big Sur (darwin)
* Kernel: 20.3.0 x64
* Node: v15.14.0
* V8: 8.6.395.17-node.28

```
# single directory (~5-10 files)
  @folder/readdir x 24,938 ops/sec (124,693 runs sampled)
             fdir x 24,771 ops/sec (123,858 runs sampled)

# recursive ~220 files
  @folder/readdir x 1,915 ops/sec (9,576 runs sampled)
             fdir x 1,850 ops/sec (9,253 runs sampled)

# recursive ~2,700 files
  @folder/readdir x 155 ops/sec (780 runs sampled)
             fdir x 145 ops/sec (730 runs sampled)

# recursive ~57,200 files (just gatsby!)
  @folder/readdir x 11 ops/sec (57 runs sampled)
             fdir x 10 ops/sec (54 runs sampled)
```

## About

<details>
<summary><strong>Contributing</strong></summary>

Pull requests and stars are always welcome. For bugs and feature requests, [please create an issue](../../issues/new).

</details>

<details>
<summary><strong>Running Tests</strong></summary>

Running and reviewing unit tests is a great way to get familiarized with a library and its API. You can install dependencies and run tests with the following command:

```sh
$ npm install && npm test
```

</details>

<details>
<summary><strong>Building docs</strong></summary>

_(This project's readme.md is generated by [verb](https://github.com/verbose/verb-generate-readme), please don't edit the readme directly. Any changes to the readme must be made in the [.verb.md](.verb.md) readme template.)_

To generate the readme, run the following command:

```sh
$ npm install -g verbose/verb#dev verb-generate-readme && verb
```

</details>

### Author

**Jon Schlinkert**

* [GitHub Profile](https://github.com/jonschlinkert)
* [Twitter Profile](https://twitter.com/jonschlinkert)
* [LinkedIn Profile](https://linkedin.com/in/jonschlinkert)

### License

Copyright © 2021, [Jon Schlinkert](https://github.com/jonschlinkert).
Released under the [MIT License](LICENSE).

***

_This file was generated by [verb-generate-readme](https://github.com/verbose/verb-generate-readme), v0.8.0, on April 19, 2021._
