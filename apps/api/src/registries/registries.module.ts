import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from '../iam/iam.module';
import { AiAssistantController } from './ai-assistant.controller';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { LicenseDocumentsController } from './license-documents.controller';
import { LicenseDocumentsService } from './license-documents.service';
import { LicenseStatusService } from './license-status.service';
import { LicensesController } from './licenses.controller';
import { LicensesService } from './licenses.service';
import { PlayerResolverService } from './player-resolver.service';
import { RegistrationStatusService } from './registration-status.service';
import { RegistriesController } from './registries.controller';
import { RegistriesService } from './registries.service';
import { RkjoAiAdapterService } from './rkjo-ai-adapter.service';
import { StaffLifecycleController } from './staff-lifecycle.controller';
import { StaffLifecycleService } from './staff-lifecycle.service';

@Module({
  imports: [AuthModule, IamModule],
  controllers: [
    RegistriesController,
    LicensesController,
    LicenseDocumentsController,
    AiAssistantController,
    StaffLifecycleController,
  ],
  providers: [
    RegistriesService,
    RegistrationStatusService,
    LicensesService,
    LicenseStatusService,
    DocumentIntelligenceService,
    LicenseDocumentsService,
    PlayerResolverService,
    RkjoAiAdapterService,
    StaffLifecycleService,
  ],
})
export class RegistriesModule {}
