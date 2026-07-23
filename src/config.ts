import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const DEFAULT_API_URL = 'https://pastes.io';

export interface StoredConfig {
  apiKey?: string;
  email?: string;
  apiUrl?: string;
}

export interface ResolvedKey {
  apiKey: string;
  source: 'flag' | 'env' | 'config';
}

/**
 * Windows users expect %APPDATA%; everyone else expects XDG. PASTES_CONFIG_HOME
 * overrides both, which is what containers and CI images tend to want.
 */
export function configDir(env: NodeJS.ProcessEnv = process.env) {
  if (env.PASTES_CONFIG_HOME) {
    return env.PASTES_CONFIG_HOME;
  }
  if (process.platform === 'win32' && env.APPDATA) {
    return join(env.APPDATA, 'pastes');
  }
  if (env.XDG_CONFIG_HOME) {
    return join(env.XDG_CONFIG_HOME, 'pastes');
  }
  return join(homedir(), '.config', 'pastes');
}

export function configPath(env: NodeJS.ProcessEnv = process.env) {
  return join(configDir(env), 'config.json');
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): StoredConfig {
  try {
    const parsed = JSON.parse(readFileSync(configPath(env), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // A missing or unreadable config is not an error — the env var may carry the key.
    return {};
  }
}

export function writeConfig(config: StoredConfig, env: NodeJS.ProcessEnv = process.env) {
  const path = configPath(env);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try {
    // writeFileSync only applies mode when creating, so re-assert it on rewrite.
    chmodSync(path, 0o600);
  } catch {
    // Permissions are advisory on Windows; the write itself already succeeded.
  }
  return path;
}

export function clearConfig(env: NodeJS.ProcessEnv = process.env) {
  try {
    rmSync(configPath(env));
    return true;
  } catch {
    return false;
  }
}

/**
 * Precedence is explicit flag, then environment, then the stored config, so a
 * production box can override a stale config file without touching disk.
 */
export function resolveApiKey({
  flagKey,
  env = process.env,
  config
}: {
  flagKey?: string;
  env?: NodeJS.ProcessEnv;
  config?: StoredConfig;
}): ResolvedKey | undefined {
  if (flagKey) {
    return { apiKey: flagKey, source: 'flag' };
  }
  const fromEnv = env.PASTES_API_KEY?.trim();
  if (fromEnv) {
    return { apiKey: fromEnv, source: 'env' };
  }
  const stored = (config ?? readConfig(env)).apiKey?.trim();
  if (stored) {
    return { apiKey: stored, source: 'config' };
  }
  return undefined;
}

export function resolveApiUrl({
  flagUrl,
  env = process.env,
  config
}: {
  flagUrl?: string;
  env?: NodeJS.ProcessEnv;
  config?: StoredConfig;
}) {
  const raw = flagUrl || env.PASTES_API_URL || config?.apiUrl || DEFAULT_API_URL;
  return raw.replace(/\/+$/, '');
}
