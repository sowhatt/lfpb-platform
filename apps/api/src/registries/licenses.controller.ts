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
import { CreateLicenseDto } from './dto/create-license.dto';
import { LicenseDecisionDto } from './dto/license-decision.dto';
import { LicensesService } from './licenses.service';

@Controller('licenses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LicensesController {
  constructor(private readonly licenses: LicensesService) {}

  @Get()
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  list(
    @CurrentActor() actor: AuthenticatedActor,
    @Query('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.licenses.listFor(actor, organizationId);
  }

  @Post()
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  create(@CurrentActor() actor: AuthenticatedActor, @Body() input: CreateLicenseDto) {
    return this.licenses.create(actor, input);
  }

  @Patch(':licenseId/submit')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  submit(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('licenseId', ParseUUIDPipe) licenseId: string,
  ) {
    return this.licenses.submit(actor, licenseId);
  }

  @Patch(':licenseId/decision')
  @Roles(Role.LIGUE_ADMIN)
  decide(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('licenseId', ParseUUIDPipe) licenseId: string,
    @Body() input: LicenseDecisionDto,
  ) {
    return this.licenses.decide(actor, licenseId, input);
  }

  @Patch(':licenseId/suspend')
  @Roles(Role.LIGUE_ADMIN)
  suspend(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('licenseId', ParseUUIDPipe) licenseId: string,
    @Body('reason') reason?: string,
  ) {
    return this.licenses.suspend(actor, licenseId, reason);
  }
}
