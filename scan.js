'use strict';

const last = (arr = []) => arr[arr.length - 1];
const split = (input, options) => {
  let string = input;
  let isGlob = false;
  let stash = [''];
  let stack = [];
  let parent = [];
  let glob = '';
  let prev;
  let i = 0;

  const append = value => (stash[stash.length - 1] += value);

  for (; i < string.length; i++) {
    let value = string[i];
    let next = () => string[++i];
    let peek = () => string[i + 1];

    switch (value) {
      case '\\':
        append(value + next());
        break;
      case '(':
      case '{':
      case '[':
        stack.push({ value });
        append(value);
        break;
      case ')':
      case '}':
      case ']':
        stack.pop();
        append(value);
        break;
      case '.':
        append(value);
        break;
      case '!':
        if (i === 0 || peek() === '(') {
          isGlob = true;
        }
        append(value);
        break;
      case '*':
      case '+':
      case '?':
        isGlob = true;
        append(value);
        break;
      case '@':
        if (peek() === '(') {
          isGlob = true;
        }
        append(value);
        break;

      case '/':
        if (stack.length === 0) {
          let prev = last(stash);
          if (prev !== void 0) {
            if (isGlob === false) {
              parent.push(prev);
            } else {
              glob = prev + string.slice(i);
              parent = parent.join('/');
              return { parent, glob };
            }
          }
          stash.push('');
        } else {
          append(value);
        }
        break;
      default: {
        append(value);
        break;
      }
    }

    prev = value;
  }

  glob = stash.pop();
  parent = parent.join('/');
  return { parent, glob };
};

module.exports = split;
