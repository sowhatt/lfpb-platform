import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // A 5 MB audio recording becomes roughly 6.7 MB once encoded as a data URL.
  // Keep the transport limit aligned with TranscribeAudioDto and the service's
  // decoded-byte validation instead of Express' 100 KB default.
  app.useBodyParser('json', { limit: '9mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.listen(Number(process.env.API_PORT ?? 3001), '0.0.0.0');
}

void bootstrap();
