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
import { ControlMatchSheetPlayerDto } from './dto/control-match-sheet-player.dto';
import { SignMatchSheetDto } from './dto/sign-match-sheet.dto';
import { SubmitMatchSheetDto } from './dto/submit-match-sheet.dto';
import { MatchSheetPlayerControlsService } from './match-sheet-player-controls.service';
import { MatchSheetSignaturesService } from './match-sheet-signatures.service';
import { MatchSheetsService } from './match-sheets.service';

@Controller('matches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MatchSheetsController {
  constructor(
    private readonly matchSheets: MatchSheetsService,
    private readonly playerControls: MatchSheetPlayerControlsService,
    private readonly signatures: MatchSheetSignaturesService,
  ) {}

  @Get(':matchId/eligible-players')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN, Role.OFFICIEL)
  eligiblePlayers(@CurrentActor() actor: AuthenticatedActor, @Param('matchId', ParseUUIDPipe) matchId: string, @Query('clubId', ParseUUIDPipe) clubId: string) {
    return this.matchSheets.eligiblePlayers(actor, matchId, clubId);
  }

  @Get(':matchId/sheet')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN, Role.OFFICIEL)
  getSheet(@CurrentActor() actor: AuthenticatedActor, @Param('matchId', ParseUUIDPipe) matchId: string) {
    return this.matchSheets.getSheet(actor, matchId);
  }

  @Get(':matchId/sheet/player-controls')
  @Roles(Role.LIGUE_ADMIN, Role.OFFICIEL)
  playerControlSummary(@CurrentActor() actor: AuthenticatedActor, @Param('matchId', ParseUUIDPipe) matchId: string) {
    return this.playerControls.list(actor, matchId);
  }

  @Get(':matchId/sheet/signatures')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN, Role.OFFICIEL)
  signatureSummary(@CurrentActor() actor: AuthenticatedActor, @Param('matchId', ParseUUIDPipe) matchId: string) {
    return this.signatures.list(actor, matchId);
  }

  @Post(':matchId/sheet/signatures')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN, Role.OFFICIEL)
  signSheet(@CurrentActor() actor: AuthenticatedActor, @Param('matchId', ParseUUIDPipe) matchId: string, @Body() input: SignMatchSheetDto) {
    return this.signatures.sign(actor, matchId, input);
  }

  @Post(':matchId/sheet/players')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  addPlayer(@CurrentActor() actor: AuthenticatedActor, @Param('matchId', ParseUUIDPipe) matchId: string, @Body() input: AddMatchSheetPlayerDto) {
    return this.matchSheets.addPlayer(actor, matchId, input);
  }

  @Post(':matchId/sheet/players/:registrationId/control')
  @Roles(Role.OFFICIEL)
  controlPlayer(@CurrentActor() actor: AuthenticatedActor, @Param('matchId', ParseUUIDPipe) matchId: string, @Param('registrationId', ParseUUIDPipe) registrationId: string, @Body() input: ControlMatchSheetPlayerDto) {
    return this.playerControls.controlPlayer(actor, matchId, registrationId, input);
  }

  @Post(':matchId/sheet/submit')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  submit(@CurrentActor() actor: AuthenticatedActor, @Param('matchId', ParseUUIDPipe) matchId: string, @Body() input: SubmitMatchSheetDto) {
    return this.matchSheets.submitSide(actor, matchId, input.clubId);
  }

  @Post(':matchId/sheet/validate')
  @Roles(Role.LIGUE_ADMIN, Role.OFFICIEL)
  validate(@CurrentActor() actor: AuthenticatedActor, @Param('matchId', ParseUUIDPipe) matchId: string) {
    return this.matchSheets.validateSheet(actor, matchId);
  }

  @Post(':matchId/sheet/lock')
  @Roles(Role.LIGUE_ADMIN, Role.OFFICIEL)
  async lock(@CurrentActor() actor: AuthenticatedActor, @Param('matchId', ParseUUIDPipe) matchId: string) {
    await this.playerControls.assertAllVerified(actor, matchId);
    return this.matchSheets.lockSheet(actor, matchId);
  }
}
