export const COMMANDS = ['create', 'login', 'logout', 'whoami', 'get', 'ls', 'rm'] as const;

export type Command = (typeof COMMANDS)[number];

export interface ParsedArgs {
  command: Command;
  /** Positional argument: a file path for `create`, a slug for `get`/`rm`, a query for `ls`. */
  target?: string;
  title?: string;
  syntax?: string;
  expire?: string;
  password?: string;
  apiKey?: string;
  apiUrl?: string;
  page?: number;
  copy: boolean;
  quiet: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
  /** `login --with-key` reads a key from stdin instead of running the device flow. */
  withKey: boolean;
}

export class ArgError extends Error {}

const FLAG_ALIASES: Record<string, string> = {
  '-t': '--title',
  '-s': '--syntax',
  '-e': '--expire',
  '-p': '--password',
  '-q': '--quiet',
  '-h': '--help',
  '-v': '--version'
};

const VALUE_FLAGS = new Set([
  '--title',
  '--syntax',
  '--expire',
  '--password',
  '--api-key',
  '--api-url',
  '--page'
]);

const BOOLEAN_FLAGS = new Set([
  '--quiet',
  '--json',
  '--help',
  '--version',
  '--copy',
  '--no-copy',
  '--with-key'
]);

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: 'create',
    copy: true,
    quiet: false,
    json: false,
    help: false,
    version: false,
    withKey: false
  };

  const positionals: string[] = [];
  let commandRead = false;
  let onlyPositionals = false;

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];

    if (onlyPositionals) {
      positionals.push(raw);
      continue;
    }
    if (raw === '--') {
      onlyPositionals = true;
      continue;
    }

    if (raw.startsWith('-') && raw !== '-') {
      // Support --flag=value as well as --flag value.
      const eq = raw.indexOf('=');
      const name = FLAG_ALIASES[eq === -1 ? raw : raw.slice(0, eq)] || (eq === -1 ? raw : raw.slice(0, eq));
      const inlineValue = eq === -1 ? undefined : raw.slice(eq + 1);

      if (VALUE_FLAGS.has(name)) {
        const value = inlineValue ?? argv[++i];
        if (value === undefined) {
          throw new ArgError(`${name} needs a value`);
        }
        applyValueFlag(parsed, name, value);
        continue;
      }
      if (BOOLEAN_FLAGS.has(name)) {
        if (inlineValue !== undefined) {
          throw new ArgError(`${name} does not take a value`);
        }
        applyBooleanFlag(parsed, name);
        continue;
      }
      throw new ArgError(`Unknown option ${name}`);
    }

    if (!commandRead && (COMMANDS as readonly string[]).includes(raw)) {
      parsed.command = raw as Command;
      commandRead = true;
      continue;
    }
    positionals.push(raw);
  }

  if (positionals.length > 1) {
    throw new ArgError(`Unexpected argument ${positionals[1]}`);
  }
  parsed.target = positionals[0];
  return parsed;
}

function applyValueFlag(parsed: ParsedArgs, name: string, value: string) {
  switch (name) {
    case '--title':
      parsed.title = value;
      return;
    case '--syntax':
      parsed.syntax = value;
      return;
    case '--expire':
      parsed.expire = value.toUpperCase();
      return;
    case '--password':
      parsed.password = value;
      return;
    case '--api-key':
      parsed.apiKey = value;
      return;
    case '--api-url':
      parsed.apiUrl = value.replace(/\/+$/, '');
      return;
    case '--page': {
      const page = Number(value);
      if (!Number.isInteger(page) || page < 1) {
        throw new ArgError('--page must be a positive integer');
      }
      parsed.page = page;
      return;
    }
  }
}

function applyBooleanFlag(parsed: ParsedArgs, name: string) {
  switch (name) {
    case '--quiet':
      parsed.quiet = true;
      return;
    case '--json':
      parsed.json = true;
      return;
    case '--help':
      parsed.help = true;
      return;
    case '--version':
      parsed.version = true;
      return;
    case '--copy':
      parsed.copy = true;
      return;
    case '--no-copy':
      parsed.copy = false;
      return;
    case '--with-key':
      parsed.withKey = true;
      return;
  }
}

export const HELP_TEXT = `pastes — share text, code, and logs on pastes.io

Usage
  pastes [file]                 Create a paste from a file, or from stdin
  pastes login                  Connect this machine to your pastes.io account
  pastes logout                 Forget the stored API key
  pastes whoami                 Show the account the stored key belongs to
  pastes get <slug>             Print a paste's content to stdout
  pastes ls [query]             List your pastes
  pastes rm <slug>              Delete a paste you own

Create options
  -t, --title <title>           Paste title (default: filename, or first line)
  -s, --syntax <slug>           Syntax highlighting (default: inferred, else txt)
  -e, --expire <code>           10M 1H 1D 1W 2W 1M 6M 1Y N SD (default: 1M)
  -p, --password <password>     Protect the paste with a password
      --no-copy                 Do not copy the URL to the clipboard

General options
      --api-key <key>           Use this key instead of the stored one
      --api-url <url>           Override the API base URL
      --json                    Print the raw JSON response
  -q, --quiet                   Print only essential output
  -h, --help                    Show this help
  -v, --version                 Show the version

Examples
  ./deploy.sh 2>&1 | pastes
  pastes server.py --expire 1D
  kubectl logs pod-1 | pastes -t "pod-1 crash" -s logs
  pastes get frosty-mole-8821 > restored.txt

The API key is read from --api-key, then PASTES_API_KEY, then the config file.
Set PASTES_API_KEY in CI and production; run \`pastes login\` on your own machine.
`;
