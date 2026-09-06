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
import { MatchSheetsService } from './match-sheets.service';

@Controller('matches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MatchSheetsController {
  constructor(private readonly matchSheets: MatchSheetsService) {}

  @Get(':matchId/eligible-players')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN, Role.OFFICIEL)
  eligiblePlayers(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Query('clubId', ParseUUIDPipe) clubId: string,
  ) {
    return this.matchSheets.eligiblePlayers(actor, matchId, clubId);
  }
}
