import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  DEFAULT_API_URL,
  clearConfig,
  configPath,
  readConfig,
  resolveApiKey,
  resolveApiUrl,
  writeConfig
} from '../src/config.js';

function tempEnv() {
  return { PASTES_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'pastes-cli-')) } as NodeJS.ProcessEnv;
}

test('an explicit flag beats the environment and the config file', () => {
  const resolved = resolveApiKey({
    flagKey: 'from-flag',
    env: { PASTES_API_KEY: 'from-env' },
    config: { apiKey: 'from-config' }
  });
  assert.deepEqual(resolved, { apiKey: 'from-flag', source: 'flag' });
});

test('the environment beats the config file, so production can override a stale key', () => {
  const resolved = resolveApiKey({
    env: { PASTES_API_KEY: 'from-env' },
    config: { apiKey: 'from-config' }
  });
  assert.deepEqual(resolved, { apiKey: 'from-env', source: 'env' });
});

test('falls back to the stored key', () => {
  const resolved = resolveApiKey({ env: {}, config: { apiKey: 'from-config' } });
  assert.deepEqual(resolved, { apiKey: 'from-config', source: 'config' });
});

test('returns undefined when no key is available anywhere', () => {
  assert.equal(resolveApiKey({ env: {}, config: {} }), undefined);
});

test('ignores blank and whitespace-only keys', () => {
  assert.equal(resolveApiKey({ env: { PASTES_API_KEY: '   ' }, config: {} }), undefined);
  assert.deepEqual(resolveApiKey({ env: { PASTES_API_KEY: '  k  ' }, config: {} }), {
    apiKey: 'k',
    source: 'env'
  });
});

test('resolves the API URL by flag, then env, then config, then the default', () => {
  assert.equal(resolveApiUrl({ flagUrl: 'http://a', env: { PASTES_API_URL: 'http://b' } }), 'http://a');
  assert.equal(resolveApiUrl({ env: { PASTES_API_URL: 'http://b' }, config: { apiUrl: 'http://c' } }), 'http://b');
  assert.equal(resolveApiUrl({ env: {}, config: { apiUrl: 'http://c/' } }), 'http://c');
  assert.equal(resolveApiUrl({ env: {} }), DEFAULT_API_URL);
});

test('writes the config with owner-only permissions and reads it back', () => {
  const env = tempEnv();
  try {
    const path = writeConfig({ apiKey: 'k', email: 'a@b.c' }, env);
    assert.equal(path, configPath(env));
    assert.deepEqual(readConfig(env), { apiKey: 'k', email: 'a@b.c' });
    assert.ok(readFileSync(path, 'utf8').endsWith('\n'));
    if (process.platform !== 'win32') {
      assert.equal(statSync(path).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(env.PASTES_CONFIG_HOME!, { recursive: true, force: true });
  }
});

test('a missing config reads as empty rather than throwing', () => {
  const env = tempEnv();
  try {
    assert.deepEqual(readConfig(env), {});
    assert.equal(clearConfig(env), false);
  } finally {
    rmSync(env.PASTES_CONFIG_HOME!, { recursive: true, force: true });
  }
});

test('logout removes the stored config', () => {
  const env = tempEnv();
  try {
    writeConfig({ apiKey: 'k' }, env);
    assert.equal(clearConfig(env), true);
    assert.deepEqual(readConfig(env), {});
  } finally {
    rmSync(env.PASTES_CONFIG_HOME!, { recursive: true, force: true });
  }
});
