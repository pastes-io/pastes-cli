// Node's test runner only expands glob patterns from v22 on, and cmd.exe does
// not expand them at all, so collect the files here and pass explicit paths.
// Works on every supported Node version and OS.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = 'tests';

const files = readdirSync(TEST_DIR)
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .map((name) => join(TEST_DIR, name));

if (files.length === 0) {
  console.error(`No test files found in ${TEST_DIR}/`);
  process.exit(1);
}

// shell: true so `tsx` resolves from PATH, which npm populates with every
// ancestor node_modules/.bin — this package builds standalone and in a monorepo.
const result = spawnSync('tsx', ['--test', ...files], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
