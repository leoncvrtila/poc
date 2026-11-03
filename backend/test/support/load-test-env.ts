import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

/** Integration tests always run against the dedicated test database and test index. */
export function loadTestEnv(): void {
  const values = parseEnv(readFileSync(resolve(__dirname, '../../.env.test'), 'utf8'));
  Object.assign(process.env, values);
}

loadTestEnv();
