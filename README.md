# pastes

Share text, code, and logs on [pastes.io](https://pastes.io) from your terminal. Pipe something in, get a link back.

```bash
npx pastes --help
```

## Install

```bash
npm install -g pastes
```

Or run it without installing: `npx pastes`.

Requires Node.js 20 or newer. No runtime dependencies.

## Sign in

```bash
pastes login
```

This prints a short code and a link. Open the link on any device — your laptop, your phone — approve the code, and the CLI stores the API key it is issued. Because the code is displayed rather than typed into a browser on the same machine, this works fine over SSH on a box with no GUI.

For CI, containers, and production, skip the login and set an environment variable instead:

```bash
export PASTES_API_KEY=your-key
```

Create a key at [pastes.io/profile](https://pastes.io/profile). The CLI reads the key from `--api-key`, then `PASTES_API_KEY`, then its config file — so the environment variable always wins over a stale stored key.

## Use

```bash
# Pipe anything
./deploy.sh 2>&1 | pastes
kubectl logs pod-1 | pastes -t "pod-1 crash" -s logs

# Or point it at a file — title and syntax are inferred from the name
pastes server.py
pastes nginx.log --expire 1D

# Read, list, delete
pastes get frosty-mole-8821 > restored.txt
pastes ls "crash"
pastes rm frosty-mole-8821
```

The paste URL is the only thing written to stdout, so it composes:

```bash
pastes < error.log | xargs -I{} curl -X POST "$SLACK_WEBHOOK" -d "{\"text\":\"{}\"}"
```

Everything else — progress, warnings, the clipboard notice — goes to stderr.

## Options

| Option | Description |
| --- | --- |
| `-t, --title <title>` | Paste title. Defaults to the filename, or the first line of input. |
| `-s, --syntax <slug>` | Syntax highlighting. Defaults to the one inferred from the filename, else `txt`. |
| `-e, --expire <code>` | `10M` `1H` `1D` `1W` `2W` `1M` `6M` `1Y` `N` `SD`. Defaults to `1M`. Free accounts must use `1M`. |
| `-p, --password <pw>` | Protect the paste with a password. |
| `--no-copy` | Do not copy the URL to the clipboard. |
| `--api-key <key>` | Use this key for one command. |
| `--api-url <url>` | Point at a different host (useful for local development). |
| `--json` | Print the raw JSON response instead of the URL. |
| `-q, --quiet` | Suppress the non-essential stderr output. |

## Environment variables

| Variable | Effect |
| --- | --- |
| `PASTES_API_KEY` | API key to use. Overrides the stored config. |
| `PASTES_API_URL` | API base URL. Defaults to `https://pastes.io`. |
| `PASTES_CONFIG_HOME` | Directory for `config.json`. Defaults to `%APPDATA%\pastes` on Windows, `$XDG_CONFIG_HOME/pastes` or `~/.config/pastes` elsewhere. |
| `PASTES_NO_BROWSER` | Never launch a browser during `pastes login`; just print the link. |

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | The request failed — network error, rejected key, rate limit. |
| `2` | Usage error — bad flag, missing input, no API key configured. |

## Rate limits

Free accounts have per-window and daily paste-creation limits and a daily cap on API reads and searches. Pro raises the creation limits and removes the read/search cap. See [pastes.io/pricing](https://pastes.io/pricing).

## Programmatic use

```js
import { PastesClient } from 'pastes';

const client = new PastesClient({
  apiUrl: 'https://pastes.io',
  apiKey: process.env.PASTES_API_KEY
});
const { success } = await client.createPaste({
  title: 'Build log',
  content: log,
  syntax: 'logs'
});
console.log(success.paste_url);
```

## Development

```bash
npm install
npm test
```

The test suite has no external dependencies — the end-to-end tests run the compiled binary against a local mock of the API, so nothing touches pastes.io and no key is needed.

To point the CLI at a local server while developing:

```bash
npm run dev -- --api-url http://localhost:3012 --help
```

## License

MIT
