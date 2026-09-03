import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentActor } from '../iam/current-actor.decorator';
import { AuthenticatedActor } from '../iam/domain/actor';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { OfficialMatchPlayerAccessService } from './official-match-player-access.service';

@Controller('official-match-access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OFFICIEL)
export class OfficialMatchPlayerAccessController {
  constructor(
    private readonly service: OfficialMatchPlayerAccessService,
  ) {}

  @Get(':matchId/players')
  listPlayers(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.service.listMatchPlayers(actor, matchId);
  }

  @Get(':matchId/players/resolve')
  resolvePlayer(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Query('q') query: string,
  ) {
    return this.service.resolveMatchPlayer(actor, matchId, query ?? '');
  }
}
