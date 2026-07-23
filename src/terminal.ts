import { spawn, spawnSync } from 'node:child_process';

/**
 * Everything the user reads goes to stderr so stdout stays a clean pipe:
 * `pastes < log | pbcopy` must receive the URL and nothing else.
 */
export function note(message: string, { quiet = false } = {}) {
  if (!quiet) {
    process.stderr.write(`${message}\n`);
  }
}

export function fail(message: string) {
  process.stderr.write(`error: ${message}\n`);
}

export function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

export function hasPipedStdin() {
  return !process.stdin.isTTY;
}

/** True when there is plausibly a desktop session that could show a browser. */
export function hasDisplay() {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    return true;
  }
  if (process.env.SSH_CONNECTION || process.env.SSH_TTY) {
    return false;
  }
  return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

function runDetached(command: string, args: string[]) {
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {
      // Nothing to do — callers always print the URL as a fallback.
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export function openBrowser(url: string) {
  // Escape hatch for CI, containers, and anyone who does not want their browser
  // taken over. The link is always printed, so nothing is lost.
  if (process.env.PASTES_NO_BROWSER) {
    return false;
  }
  if (!hasDisplay()) {
    return false;
  }
  if (process.platform === 'win32') {
    // `start` is a cmd builtin; the empty string is the (required) window title.
    return runDetached('cmd', ['/c', 'start', '', url]);
  }
  if (process.platform === 'darwin') {
    return runDetached('open', [url]);
  }
  return runDetached('xdg-open', [url]);
}

function clipboardCommand(): [string, string[]] | undefined {
  if (process.platform === 'win32') {
    return ['clip', []];
  }
  if (process.platform === 'darwin') {
    return ['pbcopy', []];
  }
  if (process.env.WAYLAND_DISPLAY) {
    return ['wl-copy', []];
  }
  if (process.env.DISPLAY) {
    return ['xclip', ['-selection', 'clipboard']];
  }
  return undefined;
}

/** Best effort: a machine without a clipboard tool is not an error. */
export function copyToClipboard(text: string) {
  const command = clipboardCommand();
  if (!command) {
    return false;
  }
  try {
    const result = spawnSync(command[0], command[1], { input: text, stdio: 'pipe' });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}
