import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { PrismaService } from './database/prisma.service';

async function ensureOfficialAssignmentIndexes(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "MatchOfficialAssignment_matchId_role_key"');
  await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "MatchOfficialAssignment_matchId_officialProfileId_key"');
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "MatchOfficialAssignment_active_match_role_key"
    ON "MatchOfficialAssignment" ("matchId", "role")
    WHERE "status" IN ('DRAFT', 'SENT', 'ACCEPTED')
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "MatchOfficialAssignment_active_match_official_key"
    ON "MatchOfficialAssignment" ("matchId", "officialProfileId")
    WHERE "status" IN ('DRAFT', 'SENT', 'ACCEPTED')
  `);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const prisma = app.get(PrismaService);

  await ensureOfficialAssignmentIndexes(prisma);

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
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
