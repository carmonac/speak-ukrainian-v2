import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { useJsonBodyParser } from './common/body-parser.js';
import { securityHeaders } from './common/security-headers.js';
import type { Env } from './config/configuration.js';
import { ConfigService } from '@nestjs/config';
import { SiteService } from './site/site.service.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    // Parsers are registered below with an explicit limit; `rawBody` keeps the
    // exact bytes Stripe signed, which the webhook verifies.
    bodyParser: false,
    rawBody: true,
  });
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  const port = config.get('PORT', { infer: true });

  // Behind Caddy in production: take the visitor's address from the proxy.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  app.use(securityHeaders());
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }), credentials: true });

  // After CORS, so a 413 still carries the CORS headers the browser needs to
  // show the real status.
  useJsonBodyParser(app);

  // The public site: every GET outside /api is a page written in the panel.
  app.use(app.get(SiteService).middleware);

  if (nodeEnv !== 'production') {
    const swagger = new DocumentBuilder()
      .setTitle('SpeakUkrainian API')
      .setDescription('Pages, courses, H5P, students, payments and chat')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));
  }

  await app.listen(port, '0.0.0.0');
  Logger.log(`API and public site listening on :${port} (${nodeEnv})`, 'Bootstrap');
}

void bootstrap();
