import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './main';

/// Builds the app once per serverless instance and returns the Express
/// handler. Used by api/index.js on Vercel.
export async function createHandler() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'] });
  // Vercel sits in front as a proxy; take the client IP from X-Forwarded-For
  app.set('trust proxy', 1);
  configureApp(app);
  await app.init();
  return app.getHttpAdapter().getInstance();
}
