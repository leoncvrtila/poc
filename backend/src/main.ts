import { loadEnvFile } from './shared/config/load-env';
loadEnvFile();

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { APP_CONFIG, type AppConfig } from './shared/config/app-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port);
}
void bootstrap();
