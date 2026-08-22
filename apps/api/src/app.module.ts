import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { IamModule } from './iam/iam.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { RegistriesModule } from './registries/registries.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    DatabaseModule,
    AuthModule,
    CompetitionsModule,
    IamModule,
    OrganizationsModule,
    RegistriesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
