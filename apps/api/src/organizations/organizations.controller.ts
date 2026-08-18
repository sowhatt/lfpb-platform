import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentActor } from '../iam/current-actor.decorator';
import { AuthenticatedActor } from '../iam/domain/actor';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { CreateClubDto } from './dto/create-club.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(@CurrentActor() actor: AuthenticatedActor) {
    return this.organizations.listFor(actor);
  }

  @Get(':organizationId')
  findOne(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.organizations.findOneFor(actor, organizationId);
  }

  @Post('clubs')
  @Roles(Role.LIGUE_ADMIN)
  createClub(@Body() input: CreateClubDto) {
    return this.organizations.createClub(input);
  }
}
