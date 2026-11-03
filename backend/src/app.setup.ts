import { type INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configureApp(app: INestApplication): void {
  const express = app as NestExpressApplication;
  // Behind nginx: use X-Forwarded-For so rate limiting sees the real client IP. Only private-network proxies
  // (e.g. nginx on the Docker bridge) are trusted, so a client cannot spoof its IP with its own header.
  express.set('trust proxy', 'loopback, linklocal, uniquelocal');
  express.useBodyParser('json', { limit: '32kb' });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Product Finder API').setVersion('1.0').build(),
  );
  SwaggerModule.setup('api/docs', app, document);
}
