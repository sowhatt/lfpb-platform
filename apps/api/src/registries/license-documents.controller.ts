import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentActor } from '../iam/current-actor.decorator';
import { AuthenticatedActor } from '../iam/domain/actor';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { LicenseDocumentsService } from './license-documents.service';

@Controller('license-documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LicenseDocumentsController {
  constructor(private readonly documents: LicenseDocumentsService) {}

  @Get(':registrationId/checklist')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  checklist(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
  ) {
    return this.documents.checklist(actor, registrationId);
  }

  @Post(':registrationId/upload')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  upload(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Query('itemCode') itemCode: string,
    @UploadedFile() file: any,
  ) {
    return this.documents.upload(actor, registrationId, itemCode, file);
  }
}
