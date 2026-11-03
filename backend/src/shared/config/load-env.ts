import { existsSync } from 'node:fs';

/** Loads `.env` for local runs. Containers pass real environment variables and ship no `.env`. */
export function loadEnvFile(path = '.env'): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}
