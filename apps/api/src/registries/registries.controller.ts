import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentActor } from '../iam/current-actor.decorator';
import { AuthenticatedActor } from '../iam/domain/actor';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { CreatePlayerDto } from './dto/create-player.dto';
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
}
