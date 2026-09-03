import {
  Body,
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
import { DocumentIntelligenceService, ExtractedDocumentData } from './document-intelligence.service';
import { LicenseDocumentsService } from './license-documents.service';

@Controller('license-documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LicenseDocumentsController {
  constructor(
    private readonly documents: LicenseDocumentsService,
    private readonly documentIntelligence: DocumentIntelligenceService,
  ) {}

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

  @Get('analysis/:documentId')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  analysis(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.documentIntelligence.get(actor, documentId);
  }

  @Post('analysis/:documentId/evaluate')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  evaluate(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() body: {
      extractedData?: ExtractedDocumentData;
      provider?: string;
      model?: string;
      rawText?: string;
    },
  ) {
    return this.documentIntelligence.evaluate(
      actor,
      documentId,
      body.extractedData ?? {},
      body.provider,
      body.model,
      body.rawText,
    );
  }
}
