import { loadEnvFile } from './shared/config/load-env';
loadEnvFile();
// One-shot commands must not start the background relay; they drain the outbox explicitly.
process.env.OUTBOX_RELAY_ENABLED = 'false';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { runCommand } from './cli/run-command';

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  try {
    process.exitCode = await runCommand(app, command, args);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
