import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveTitle, syntaxForFilename } from '../src/syntax.js';

test('maps common extensions to pastes.io syntax slugs', () => {
  assert.equal(syntaxForFilename('server.py'), 'python');
  assert.equal(syntaxForFilename('main.rs'), 'rust');
  assert.equal(syntaxForFilename('app.tsx'), 'typescript');
  assert.equal(syntaxForFilename('deploy.sh'), 'bash');
  assert.equal(syntaxForFilename('nginx.log'), 'logs');
  assert.equal(syntaxForFilename('values.yml'), 'yaml');
  assert.equal(syntaxForFilename('setup.ps1'), 'powershell');
});

test('is case insensitive and handles both path separators', () => {
  assert.equal(syntaxForFilename('/var/log/App.LOG'), 'logs');
  assert.equal(syntaxForFilename('C:\\Users\\hao\\main.PY'), 'python');
});

test('recognises extensionless files by name', () => {
  assert.equal(syntaxForFilename('Dockerfile'), 'docker');
  assert.equal(syntaxForFilename('deploy/Dockerfile'), 'docker');
});

test('returns undefined when the extension is unknown, so the caller can default', () => {
  assert.equal(syntaxForFilename('archive.xyz'), undefined);
  assert.equal(syntaxForFilename('README'), undefined);
  assert.equal(syntaxForFilename('.hidden'), undefined);
  assert.equal(syntaxForFilename('trailing.'), undefined);
  assert.equal(syntaxForFilename(undefined), undefined);
});

test('titles a paste after its file', () => {
  assert.equal(deriveTitle({ filename: 'logs/error.log', content: 'boom' }), 'error.log');
});

test('falls back to the first non-empty line of piped input', () => {
  assert.equal(deriveTitle({ content: '\n\n  Traceback (most recent call last):\n  ...' }), 'Traceback (most recent call last):');
});

test('truncates a long first line', () => {
  const title = deriveTitle({ content: 'x'.repeat(200) });
  assert.equal(title.length, 60);
  assert.ok(title.endsWith('...'));
});

test('always produces a title, since the API requires one', () => {
  assert.equal(deriveTitle({ content: '   \n \n' }), 'Untitled paste');
});
