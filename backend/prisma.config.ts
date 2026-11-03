import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env on its own.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node dist/cli.js seed',
  },
  datasource: {
    // No fallback on purpose: `prisma generate` (Docker build) does not need a database, and commands
    // that do (migrate, seed) should fail loudly instead of silently targeting a placeholder.
    url: process.env.DATABASE_URL!,
  },
});
