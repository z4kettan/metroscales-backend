import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

export function configureApp(app: import('@nestjs/common').INestApplication) {
  app.use(helmet());
  const origins = (process.env.CORS_ORIGIN || 'http://localhost:4200').split(',').map((o) => o.trim());
  app.enableCors({ origin: origins, methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS', credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`Metro Scales backend running on http://localhost:${port}/api`);
}

if (require.main === module) bootstrap();
