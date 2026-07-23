import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before } from 'node:test';

// Drives the compiled binary the way a user would, against a stand-in for
// pastes.io. Run `npm run build` in apps/pastes-cli first.
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

interface RecordedRequest {
  method: string;
  url: string;
  auth?: string;
  body: any;
}

let server: Server;
let baseUrl: string;
let requests: RecordedRequest[] = [];
let handler: (req: RecordedRequest, res: ServerResponse) => void;

function readBody(req: IncomingMessage) {
  return new Promise<any>((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
  });
}

before(async () => {
  server = createServer(async (req, res) => {
    const recorded: RecordedRequest = {
      method: req.method || '',
      url: req.url || '',
      auth: req.headers.authorization,
      body: await readBody(req)
    };
    requests.push(recorded);
    handler(recorded, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function runCli(
  args: string[],
  { env = {}, stdin }: { env?: Record<string, string>; stdin?: string } = {}
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: {
        ...process.env,
        PASTES_API_URL: baseUrl,
        PASTES_API_KEY: '',
        PASTES_CONFIG_HOME: configHome,
        // Otherwise the login tests really do launch a browser at the mock server.
        PASTES_NO_BROWSER: '1',
        ...env
      }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    if (stdin !== undefined) {
      child.stdin.end(stdin);
    } else {
      child.stdin.end();
    }
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

let configHome: string;

before(() => {
  configHome = mkdtempSync(join(tmpdir(), 'pastes-cli-e2e-'));
});

after(() => {
  rmSync(configHome, { recursive: true, force: true });
});

test('creates a paste from stdin and prints only the URL on stdout', async () => {
  requests = [];
  handler = (req, res) =>
    send(res, 200, {
      success: { messages: 'ok', slug: 'frosty-mole-8821', paste_url: 'https://pastes.io/frosty-mole-8821' }
    });

  const result = await runCli([], {
    env: { PASTES_API_KEY: 'test-key' },
    stdin: 'Traceback (most recent call last):\n  boom\n'
  });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'https://pastes.io/frosty-mole-8821\n');
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].url, '/api/paste');
  assert.equal(requests[0].auth, 'Bearer test-key');
  assert.equal(requests[0].body.title, 'Traceback (most recent call last):');
  assert.equal(requests[0].body.syntax, 'txt');
});

test('infers title and syntax from a file argument', async () => {
  requests = [];
  handler = (req, res) =>
    send(res, 200, { success: { slug: 's', paste_url: 'https://pastes.io/s' } });

  const file = join(configHome, 'deploy.sh');
  writeFileSync(file, '#!/bin/sh\necho hi\n');
  const result = await runCli([file], { env: { PASTES_API_KEY: 'test-key' } });

  assert.equal(result.code, 0);
  assert.equal(requests[0].body.title, 'deploy.sh');
  assert.equal(requests[0].body.syntax, 'bash');
});

test('explicit flags win over inference', async () => {
  requests = [];
  handler = (req, res) =>
    send(res, 200, { success: { slug: 's', paste_url: 'https://pastes.io/s' } });

  await runCli(['-t', 'Custom', '-s', 'python', '-e', '1d', '-p', 'secret'], {
    env: { PASTES_API_KEY: 'test-key' },
    stdin: 'print(1)\n'
  });

  assert.equal(requests[0].body.title, 'Custom');
  assert.equal(requests[0].body.syntax, 'python');
  assert.equal(requests[0].body.expire, '1D');
  assert.equal(requests[0].body.password, 'secret');
});

test('refuses an empty paste without calling the API', async () => {
  requests = [];
  handler = (req, res) => send(res, 200, {});
  const result = await runCli([], { env: { PASTES_API_KEY: 'test-key' }, stdin: '   \n' });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /empty paste/);
  assert.equal(requests.length, 0);
});

test('explains how to authenticate when no key is configured', async () => {
  requests = [];
  const result = await runCli([], { stdin: 'hello' });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /pastes login/);
  assert.match(result.stderr, /PASTES_API_KEY/);
  assert.equal(requests.length, 0);
});

test('points at login when the server rejects the key', async () => {
  requests = [];
  handler = (req, res) => send(res, 401, { message: 'Please provide a valid API key' });
  const result = await runCli([], { env: { PASTES_API_KEY: 'bad' }, stdin: 'hello' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /valid API key/);
  assert.match(result.stderr, /pastes login/);
});

test('points at pricing when rate limited', async () => {
  requests = [];
  handler = (req, res) => send(res, 429, { message: 'Daily limit reached' });
  const result = await runCli([], { env: { PASTES_API_KEY: 'k' }, stdin: 'hello' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /pastes\.io\/pricing/);
});

test('get prints paste content to stdout', async () => {
  requests = [];
  handler = (req, res) => send(res, 200, { success: { slug: 'abc', content: 'line one\nline two' } });
  const result = await runCli(['get', 'abc'], { env: { PASTES_API_KEY: 'k' } });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'line one\nline two\n');
  assert.equal(requests[0].url, '/api/pastes/abc');
});

test('ls prints tab-separated slug and title', async () => {
  requests = [];
  handler = (req, res) =>
    send(res, 200, { data: [{ slug: 'a', title: 'First' }, { slug: 'b', title: 'Second' }], page: 1 });
  const result = await runCli(['ls', 'crash'], { env: { PASTES_API_KEY: 'k' } });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'a\tFirst\nb\tSecond\n');
  assert.equal(requests[0].url, '/api/pastes?q=crash');
});

test('rm deletes by slug', async () => {
  requests = [];
  handler = (req, res) => send(res, 200, { success: 'Paste successfully deleted' });
  const result = await runCli(['rm', 'abc'], { env: { PASTES_API_KEY: 'k' } });
  assert.equal(result.code, 0);
  assert.equal(requests[0].method, 'DELETE');
  assert.equal(requests[0].url, '/api/pastes/abc');
});

test('login runs the device flow and stores the issued key', async () => {
  requests = [];
  let polls = 0;
  handler = (req, res) => {
    if (req.url === '/api/cli/auth/start') {
      return send(res, 200, {
        deviceCode: 'device-123',
        userCode: 'ABCD-2345',
        verificationUri: `${baseUrl}/cli`,
        verificationUriComplete: `${baseUrl}/cli?code=ABCD-2345`,
        expiresInSec: 30,
        intervalSec: 1
      });
    }
    if (req.url === '/api/cli/auth/token') {
      polls += 1;
      // First poll is still pending, mirroring a real approval delay.
      return polls === 1
        ? send(res, 200, { status: 'pending', intervalSec: 1 })
        : send(res, 200, { status: 'approved', apiKey: 'issued-key', email: 'user@example.com' });
    }
    return send(res, 404, { message: 'not found' });
  };

  const result = await runCli(['login']);

  assert.equal(result.code, 0);
  assert.match(result.stderr, /ABCD-2345/);
  assert.match(result.stderr, /Logged in as user@example\.com/);
  assert.equal(polls, 2);
  const tokenRequests = requests.filter((r) => r.url === '/api/cli/auth/token');
  assert.equal(tokenRequests.length, 2);
  assert.ok(tokenRequests.every((r) => r.body.deviceCode === 'device-123'));

  const stored = JSON.parse(readFileSync(join(configHome, 'config.json'), 'utf8'));
  assert.equal(stored.apiKey, 'issued-key');
  assert.equal(stored.email, 'user@example.com');
});

test('the stored key is used for later commands', async () => {
  requests = [];
  handler = (req, res) => send(res, 200, { success: { email: 'user@example.com', plan: 'free' } });
  const result = await runCli(['whoami']);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'user@example.com\n');
  assert.equal(requests[0].auth, 'Bearer issued-key');
});

test('login --with-key verifies and stores a key piped in', async () => {
  requests = [];
  handler = (req, res) => send(res, 200, { success: { email: 'ci@example.com', plan: 'pro' } });
  const result = await runCli(['login', '--with-key'], { stdin: '  piped-key\n' });
  assert.equal(result.code, 0);
  assert.equal(requests[0].auth, 'Bearer piped-key');
  const stored = JSON.parse(readFileSync(join(configHome, 'config.json'), 'utf8'));
  assert.equal(stored.apiKey, 'piped-key');
});

test('logout removes the stored key and warns if the env var still overrides', async () => {
  const result = await runCli(['logout'], { env: { PASTES_API_KEY: 'still-set' } });
  assert.equal(result.code, 0);
  assert.match(result.stderr, /PASTES_API_KEY is still set/);
});

test('login expiry is reported rather than hanging', async () => {
  handler = (req, res) => {
    if (req.url === '/api/cli/auth/start') {
      return send(res, 200, {
        deviceCode: 'd',
        userCode: 'ABCD-2345',
        verificationUri: `${baseUrl}/cli`,
        verificationUriComplete: `${baseUrl}/cli`,
        expiresInSec: 30,
        intervalSec: 1
      });
    }
    return send(res, 200, { status: 'expired' });
  };
  const result = await runCli(['login']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /expired/);
});

test('--help exits cleanly without touching the network', async () => {
  requests = [];
  const result = await runCli(['--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage/);
  assert.equal(requests.length, 0);
});

test('an unknown flag is a usage error', async () => {
  const result = await runCli(['--bogus']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Unknown option --bogus/);
});
