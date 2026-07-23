#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError, PastesClient } from './api.js';
import { ArgError, HELP_TEXT, parseArgs, type ParsedArgs } from './args.js';
import {
  clearConfig,
  configPath,
  readConfig,
  resolveApiKey,
  resolveApiUrl,
  writeConfig
} from './config.js';
import { LoginError, deviceLogin } from './login.js';
import { DEFAULT_SYNTAX, deriveTitle, syntaxForFilename } from './syntax.js';
import { copyToClipboard, fail, hasPipedStdin, note, readStdin } from './terminal.js';

// Read from package.json so `pastes --version` can never drift from the
// published version. npm always ships package.json alongside dist/.
function readVersion() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
}

class UsageError extends Error {}
class AuthError extends Error {}

function buildClient(args: ParsedArgs, { requireKey = true } = {}) {
  const config = readConfig();
  const apiUrl = resolveApiUrl({ flagUrl: args.apiUrl, config });
  const resolved = resolveApiKey({ flagKey: args.apiKey, config });
  if (requireKey && !resolved) {
    throw new AuthError(
      'No API key found.\n' +
        '  Run `pastes login` to connect this machine, or set PASTES_API_KEY\n' +
        '  for CI and production environments.'
    );
  }
  return {
    client: new PastesClient({ apiUrl, apiKey: resolved?.apiKey }),
    apiUrl,
    source: resolved?.source
  };
}

async function readContent(args: ParsedArgs) {
  if (args.target) {
    try {
      return readFileSync(args.target, 'utf8');
    } catch (e) {
      throw new UsageError(`Could not read ${args.target}: ${(e as Error).message}`);
    }
  }
  if (!hasPipedStdin()) {
    throw new UsageError(
      'Nothing to paste. Pass a file, or pipe input:\n  cat error.log | pastes'
    );
  }
  return readStdin();
}

async function runCreate(args: ParsedArgs) {
  const content = await readContent(args);
  if (!content.trim()) {
    throw new UsageError('Refusing to create an empty paste.');
  }

  const { client } = buildClient(args);
  const response = await client.createPaste({
    title: args.title || deriveTitle({ filename: args.target, content }),
    content,
    syntax: args.syntax || syntaxForFilename(args.target) || DEFAULT_SYNTAX,
    ...(args.expire ? { expire: args.expire } : {}),
    ...(args.password ? { password: args.password } : {})
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    return;
  }

  const url = response.success.paste_url;
  process.stdout.write(`${url}\n`);

  // Only touch the clipboard for an interactive run; in a pipeline the user is
  // consuming stdout and a clipboard write would be a surprise.
  if (args.copy && process.stdout.isTTY && copyToClipboard(url)) {
    note('  Copied to clipboard.', { quiet: args.quiet });
  }
}

async function runLogin(args: ParsedArgs) {
  const { client, apiUrl } = buildClient(args, { requireKey: false });

  if (args.withKey) {
    if (!hasPipedStdin()) {
      throw new UsageError('`--with-key` reads the key from stdin:\n  echo $KEY | pastes login --with-key');
    }
    const apiKey = (await readStdin()).trim();
    if (!apiKey) {
      throw new UsageError('No key received on stdin.');
    }
    const verified = await new PastesClient({ apiUrl, apiKey }).whoami();
    const path = writeConfig({ ...readConfig(), apiKey, email: verified.success.email, apiUrl });
    note(`Logged in as ${verified.success.email}. Key saved to ${path}`, { quiet: args.quiet });
    return;
  }

  const result = await deviceLogin({ client, apiUrl, quiet: args.quiet });
  note('', { quiet: args.quiet });
  note(`  Logged in as ${result.email}.`, { quiet: args.quiet });
  note(`  Key saved to ${result.configPath}`, { quiet: args.quiet });
}

async function runLogout(args: ParsedArgs) {
  const removed = clearConfig();
  note(removed ? `Removed ${configPath()}` : 'No stored credentials to remove.', {
    quiet: args.quiet
  });
  if (process.env.PASTES_API_KEY) {
    note('  PASTES_API_KEY is still set in this environment and will keep being used.', {
      quiet: args.quiet
    });
  }
}

async function runWhoami(args: ParsedArgs) {
  const { client, source } = buildClient(args);
  const response = await client.whoami();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${response.success.email}\n`);
  note(`  Plan: ${response.success.plan}  Key from: ${source}`, { quiet: args.quiet });
}

async function runGet(args: ParsedArgs) {
  if (!args.target) {
    throw new UsageError('Which paste? Try `pastes get <slug>`.');
  }
  const { client } = buildClient(args, { requireKey: false });
  const response = await client.getPaste(args.target, args.password);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    return;
  }
  const content = response.success.content;
  process.stdout.write(typeof content === 'string' ? content : '');
  if (typeof content === 'string' && !content.endsWith('\n')) {
    process.stdout.write('\n');
  }
}

async function runList(args: ParsedArgs) {
  const { client } = buildClient(args);
  const response = await client.listPastes({ query: args.target, page: args.page || 1 });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    return;
  }
  const items = Array.isArray(response.data) ? response.data : [];
  if (items.length === 0) {
    note('No pastes found.', { quiet: args.quiet });
    return;
  }
  for (const item of items as Array<Record<string, unknown>>) {
    // Tab separated so `pastes ls | cut -f1` gives you a list of slugs.
    process.stdout.write(`${item.slug}\t${item.title ?? ''}\n`);
  }
}

async function runRemove(args: ParsedArgs) {
  if (!args.target) {
    throw new UsageError('Which paste? Try `pastes rm <slug>`.');
  }
  const { client } = buildClient(args);
  await client.deletePaste(args.target);
  note(`Deleted ${args.target}`, { quiet: args.quiet });
}

function explain(e: unknown) {
  if (e instanceof ApiError) {
    if (e.status === 401) {
      return (
        `${e.message}\n` +
        '  Run `pastes login`, or check the key in PASTES_API_KEY.'
      );
    }
    if (e.status === 429) {
      return `${e.message}\n  See https://pastes.io/pricing for higher limits.`;
    }
    return e.message;
  }
  if (e instanceof Error) {
    return e.message;
  }
  return String(e);
}

async function main() {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    fail(e instanceof ArgError ? e.message : String(e));
    process.stderr.write('\nRun `pastes --help` for usage.\n');
    process.exitCode = 2;
    return;
  }

  if (args.version) {
    process.stdout.write(`${readVersion()}\n`);
    return;
  }
  if (args.help) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  const commands: Record<string, (a: ParsedArgs) => Promise<void>> = {
    create: runCreate,
    login: runLogin,
    logout: runLogout,
    whoami: runWhoami,
    get: runGet,
    ls: runList,
    rm: runRemove
  };

  try {
    await commands[args.command](args);
  } catch (e) {
    fail(explain(e));
    process.exitCode = e instanceof UsageError || e instanceof AuthError ? 2 : 1;
    if (e instanceof LoginError) {
      process.exitCode = 1;
    }
  }
}

void main();
