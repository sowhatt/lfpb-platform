import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from '../iam/iam.module';
import { RegistrationStatusService } from './registration-status.service';
import { RegistriesController } from './registries.controller';
import { RegistriesService } from './registries.service';

@Module({
  imports: [AuthModule, IamModule],
  controllers: [RegistriesController],
  providers: [RegistriesService, RegistrationStatusService],
})
export class RegistriesModule {}
