'use strict';

const colors = require('ansi-colors');
// const argv = require('minimist')(process.argv.slice(2));

const getTime = () => new Date().getTime();
// const since = start => getTime() - start;
const format = num => num.toLocaleString().replace(/\.\d+$/, '');
// const _cycle = (bench, newline) => {
//   process.stdout.write('\u001b[G');
//   process.stdout.write(`  ${bench.target}` + (newline ? '\n' : ''));
// };

const cycle = (name, total, avg, finished = false) => {
  const color = finished ? colors.green : colors.gray.dim;
  const check = color(colors.symbols.check);
  const sep = colors.dim(colors.symbols.pointerSmall);
  return process.stdout.write(`\r${check} ${name}  ${sep} avg/${format(avg).padEnd(8, ' ')} | t/${format(total).trim()}`);
};

class Bench {
  constructor(name, options) {
    if (typeof name !== 'string') {
      options = name;
      name = 'benchmarks';
    }

    this.name = name;
    this.options = { ...options };
    this.benchmarks = [];
    this.longest = 0;
  }

  add(name, fn) {
    this.longest = Math.max(this.longest, name.length);
    this.benchmarks.push({ name, fn });
    return this;
  }

  async run(options) {
    const opts = { ...this.options, ...options };
    const results = [];
    console.log(this.name);

    for (const bench of this.benchmarks) {
      if (opts.onRun) opts.onRun(bench);
      bench.name = colors.cyan(bench.name.padStart(this.longest + 1, ' '));
      bench.onCycle = opts.onCycle;
      results.push(await this.iterate(bench));
      console.log();
    }

    return results;
  }

  async iterate(options = {}) {
    const bench = { max: 5000, step: 100, ...options };

    const sec = 1000;
    const stop = bench.max;
    const step = bench.step;
    const secs = bench.secs = (stop / sec);
    const start = bench.start = getTime();
    let elapsed = getTime() - start;
    let ops = 0;
    let last = 0;

    while (elapsed < stop) {
      await bench.fn.call(this, bench);

      ops++;
      const now = getTime();
      const diff = now - last;
      elapsed = now - start;

      if (diff >= step) {
        if (bench.onCycle) {
          const state = { ops, start, last, elapsed, sec, now, stop, step };
          bench.onCycle(bench, state);
        }
        cycle(bench.name, ops, ops / (elapsed / sec));
        last = now;
      }
    }

    cycle(bench.name, ops, ops / (elapsed / sec), true);
    bench.secs = secs;
    bench.ops = ops;
    bench.formatted = format(ops);
    return bench;
  }
}

module.exports = options => new Bench(options);
