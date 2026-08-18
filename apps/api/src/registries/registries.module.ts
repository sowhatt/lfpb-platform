import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from '../iam/iam.module';
import { LicenseStatusService } from './license-status.service';
import { LicensesController } from './licenses.controller';
import { LicensesService } from './licenses.service';
import { RegistrationStatusService } from './registration-status.service';
import { RegistriesController } from './registries.controller';
import { RegistriesService } from './registries.service';

@Module({
  imports: [AuthModule, IamModule],
  controllers: [RegistriesController, LicensesController],
  providers: [
    RegistriesService,
    RegistrationStatusService,
    LicensesService,
    LicenseStatusService,
  ],
})
export class RegistriesModule {}
