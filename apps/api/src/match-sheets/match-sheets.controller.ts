import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { AddMatchSheetPlayerDto } from './dto/add-match-sheet-player.dto';
import { SubmitMatchSheetDto } from './dto/submit-match-sheet.dto';
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

  @Get(':matchId/sheet')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN, Role.OFFICIEL)
  getSheet(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.matchSheets.getSheet(actor, matchId);
  }

  @Post(':matchId/sheet/players')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  addPlayer(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() input: AddMatchSheetPlayerDto,
  ) {
    return this.matchSheets.addPlayer(actor, matchId, input);
  }

  @Post(':matchId/sheet/submit')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  submit(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() input: SubmitMatchSheetDto,
  ) {
    return this.matchSheets.submitSide(actor, matchId, input.clubId);
  }

  @Post(':matchId/sheet/validate')
  @Roles(Role.LIGUE_ADMIN, Role.OFFICIEL)
  validate(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.matchSheets.validateSheet(actor, matchId);
  }
}
