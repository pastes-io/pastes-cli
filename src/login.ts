import { ApiError, PastesClient } from './api.js';
import { readConfig, writeConfig, type StoredConfig } from './config.js';
import { note, openBrowser } from './terminal.js';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LoginError extends Error {}

/**
 * RFC 8628-style device flow: we show a short code, the user approves it in any
 * browser (phone, laptop, doesn't matter), and we poll until the key appears.
 * This is what makes `pastes login` work over SSH with no GUI on the host.
 */
export async function deviceLogin({
  client,
  apiUrl,
  quiet = false,
  now = () => Date.now()
}: {
  client: PastesClient;
  apiUrl: string;
  quiet?: boolean;
  now?: () => number;
}) {
  const start = await client.startDeviceAuth();

  note('', { quiet });
  note(`  Your code:  ${start.userCode}`, { quiet });
  note(`  Approve at: ${start.verificationUri}`, { quiet });
  note('', { quiet });

  const opened = openBrowser(start.verificationUriComplete);
  note(
    opened
      ? '  Opening your browser... waiting for approval.'
      : '  Open that link on any device and enter the code. Waiting for approval.',
    { quiet }
  );

  const deadline = now() + start.expiresInSec * 1000;
  let intervalMs = Math.max(1, start.intervalSec) * 1000;

  while (now() < deadline) {
    await sleep(intervalMs);
    let result;
    try {
      result = await client.pollDeviceAuth(start.deviceCode);
    } catch (e) {
      // A blip in connectivity should not end a login the user is midway through.
      if (e instanceof ApiError && e.status === 0) {
        continue;
      }
      throw e;
    }

    if (result.status === 'approved' && result.apiKey) {
      const config: StoredConfig = {
        ...readConfig(),
        apiKey: result.apiKey,
        email: result.email
      };
      if (apiUrl) {
        config.apiUrl = apiUrl;
      }
      const path = writeConfig(config);
      return { email: result.email, configPath: path };
    }
    if (result.status === 'expired') {
      throw new LoginError('That code expired before it was approved. Run `pastes login` again.');
    }
    if (result.status === 'slow_down' && result.intervalSec) {
      intervalMs = result.intervalSec * 1000;
    }
  }

  throw new LoginError('Timed out waiting for approval. Run `pastes login` again.');
}
