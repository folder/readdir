'use strict';

const { green, bold } = require('ansi-colors');

const ns = n => n[0] * 1e9 + n[1];
const µs = n => ns(n) / 1e3;
const ms = n => ns(n) / 1e6;
const s = n => ns(n) / 1e9;
const toTime = val => {
  let t = ns(val);
  if (t < 1000) return t.toFixed(2) + 'ns';
  t = µs(val);
  if (t < 1000) return t.toFixed(2) + 'µs';
  t = ms(val);
  if (t < 1000) return t.toFixed(2) + 'ms';
  t = s(val);
  return t.toFixed(2) + 's';
};

module.exports = name => {
  const start = process.hrtime();
  return () => {
    console.log(bold(name), green(toTime(process.hrtime(start))));
  };
};
