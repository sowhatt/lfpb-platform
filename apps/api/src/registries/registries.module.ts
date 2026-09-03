import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from '../iam/iam.module';
import { LicenseStatusService } from './license-status.service';
import { LicensesController } from './licenses.controller';
import { LicensesService } from './licenses.service';
import { RegistrationStatusService } from './registration-status.service';
import { RegistriesController } from './registries.controller';
import { RegistriesService } from './registries.service';
import { StaffLifecycleController } from './staff-lifecycle.controller';
import { StaffLifecycleService } from './staff-lifecycle.service';

@Module({
  imports: [AuthModule, IamModule],
  controllers: [RegistriesController, LicensesController, StaffLifecycleController],
  providers: [
    RegistriesService,
    RegistrationStatusService,
    LicensesService,
    LicenseStatusService,
    StaffLifecycleService,
  ],
})
export class RegistriesModule {}
