import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentActor } from '../iam/current-actor.decorator';
import { AuthenticatedActor } from '../iam/domain/actor';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { AddDocumentDto } from './dto/add-document.dto';
import { CreateOfficialDto } from './dto/create-official.dto';
import { CreatePlayerDto } from './dto/create-player.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { DocumentDecisionDto } from './dto/document-decision.dto';
import { UpdatePlayerPhotoDto } from './dto/update-player-photo.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { REGISTRY_REFERENCE_DATA } from './reference-data';
import { RegistriesService } from './registries.service';

@Controller('registries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegistriesController {
  constructor(private readonly registries: RegistriesService) {}

  @Get('references')
  references() {
    return REGISTRY_REFERENCE_DATA;
  }

  @Get('players')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  listPlayers(
    @CurrentActor() actor: AuthenticatedActor,
    @Query('organizationId') organizationId: string,
  ) {
    return this.registries.listPlayers(actor, organizationId);
  }

  @Post('players')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  createPlayer(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: CreatePlayerDto,
  ) {
    return this.registries.createPlayer(actor, input);
  }

  @Get('players/:registrationId')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  getPlayer(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
  ) {
    return this.registries.getPlayer(actor, registrationId);
  }

  @Patch('players/:registrationId/photo')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  updatePlayerPhoto(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Body() input: UpdatePlayerPhotoDto,
  ) {
    return this.registries.updatePlayerPhoto(actor, registrationId, input);
  }

  @Get('staff')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  listStaff(
    @CurrentActor() actor: AuthenticatedActor,
    @Query('organizationId') organizationId: string,
  ) {
    return this.registries.listStaff(actor, organizationId);
  }

  @Post('staff')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  createStaff(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: CreateStaffDto,
  ) {
    return this.registries.createStaff(actor, input);
  }

  @Patch('staff/:registrationId')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  updateStaff(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Body() input: UpdateStaffDto,
  ) {
    return this.registries.updateStaff(actor, registrationId, input);
  }

  @Get('officials')
  @Roles(Role.LIGUE_ADMIN)
  listOfficials(
    @CurrentActor() actor: AuthenticatedActor,
    @Query('organizationId') organizationId: string,
  ) {
    return this.registries.listOfficials(actor, organizationId);
  }

  @Post('officials')
  @Roles(Role.LIGUE_ADMIN)
  createOfficial(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: CreateOfficialDto,
  ) {
    return this.registries.createOfficial(actor, input);
  }

  @Post(':registrationId/documents')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  addDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Body() input: AddDocumentDto,
  ) {
    return this.registries.addDocument(actor, registrationId, input);
  }

  @Patch('documents/:documentId/decision')
  @Roles(Role.LIGUE_ADMIN)
  decideDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() input: DocumentDecisionDto,
  ) {
    return this.registries.decideDocument(actor, documentId, input);
  }
}
