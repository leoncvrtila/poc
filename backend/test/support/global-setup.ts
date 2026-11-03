import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { loadTestEnv } from './load-test-env';

/** Creates the test database when the Postgres volume predates `docker/postgres/init`. */
async function ensureTestDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const name = decodeURIComponent(url.pathname.slice(1));
  url.pathname = '/postgres';
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }
}

export default async function globalSetup(): Promise<void> {
  loadTestEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set; check backend/.env.test');
  }
  await ensureTestDatabase(databaseUrl);
  execSync('npx prisma migrate deploy', { cwd: resolve(__dirname, '../..'), stdio: 'inherit', env: process.env });
}
