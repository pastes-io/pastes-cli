import assert from 'node:assert/strict';
import test from 'node:test';
import { ArgError, parseArgs } from '../src/args.js';

test('defaults to the create command with no arguments', () => {
  const args = parseArgs([]);
  assert.equal(args.command, 'create');
  assert.equal(args.target, undefined);
  assert.equal(args.copy, true);
});

test('reads a file positional for create', () => {
  const args = parseArgs(['server.py']);
  assert.equal(args.command, 'create');
  assert.equal(args.target, 'server.py');
});

test('recognises subcommands and their positional', () => {
  assert.deepEqual(
    { command: parseArgs(['get', 'abc']).command, target: parseArgs(['get', 'abc']).target },
    { command: 'get', target: 'abc' }
  );
  assert.equal(parseArgs(['rm', 'abc']).command, 'rm');
  assert.equal(parseArgs(['login']).command, 'login');
});

test('accepts short and long flags with either separator', () => {
  const args = parseArgs(['-t', 'My title', '--syntax=python', '-e', '1d', 'file.py']);
  assert.equal(args.title, 'My title');
  assert.equal(args.syntax, 'python');
  assert.equal(args.expire, '1D');
  assert.equal(args.target, 'file.py');
});

test('uppercases expire codes so `1d` and `1D` behave the same', () => {
  assert.equal(parseArgs(['-e', '1w']).expire, '1W');
});

test('--no-copy disables the clipboard', () => {
  assert.equal(parseArgs(['--no-copy']).copy, false);
});

test('strips trailing slashes from --api-url', () => {
  assert.equal(parseArgs(['--api-url', 'http://localhost:3012///']).apiUrl, 'http://localhost:3012');
});

test('treats everything after -- as a positional', () => {
  const args = parseArgs(['--', '--weird-filename.txt']);
  assert.equal(args.target, '--weird-filename.txt');
});

test('a bare - is a positional, not a flag', () => {
  assert.equal(parseArgs(['-']).target, '-');
});

test('rejects unknown options', () => {
  assert.throws(() => parseArgs(['--nope']), ArgError);
});

test('rejects a value flag with no value', () => {
  assert.throws(() => parseArgs(['--title']), ArgError);
});

test('rejects a value passed to a boolean flag', () => {
  assert.throws(() => parseArgs(['--json=yes']), ArgError);
});

test('rejects a second positional', () => {
  assert.throws(() => parseArgs(['a.txt', 'b.txt']), ArgError);
});

test('rejects a non-positive --page', () => {
  assert.throws(() => parseArgs(['ls', '--page', '0']), ArgError);
  assert.throws(() => parseArgs(['ls', '--page', 'two']), ArgError);
});

test('only the first token can be the subcommand', () => {
  // `pastes get ls` asks for the paste slugged "ls", not the ls command.
  const args = parseArgs(['get', 'ls']);
  assert.equal(args.command, 'get');
  assert.equal(args.target, 'ls');
});
