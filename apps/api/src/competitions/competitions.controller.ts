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
import { CompetitionsService } from './competitions.service';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { CreateMatchDto } from './dto/create-match.dto';
import { CreateRoundDto } from './dto/create-round.dto';
import { CreateSeasonDto } from './dto/create-season.dto';
import { CreateVenueDto } from './dto/create-venue.dto';
import { EnrollClubDto } from './dto/enroll-club.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompetitionsController {
  constructor(private readonly competitions: CompetitionsService) {}

  @Get('seasons')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN, Role.OFFICIEL)
  listSeasons() {
    return this.competitions.listSeasons();
  }

  @Post('seasons')
  @Roles(Role.LIGUE_ADMIN)
  createSeason(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: CreateSeasonDto,
  ) {
    return this.competitions.createSeason(actor, input);
  }

  @Get('competitions')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN, Role.OFFICIEL)
  listCompetitions(@Query('seasonId') seasonId?: string) {
    return this.competitions.listCompetitions(seasonId);
  }

  @Post('competitions')
  @Roles(Role.LIGUE_ADMIN)
  createCompetition(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: CreateCompetitionDto,
  ) {
    return this.competitions.createCompetition(actor, input);
  }

  @Post('competitions/:competitionId/clubs')
  @Roles(Role.LIGUE_ADMIN)
  enrollClub(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
    @Body() input: EnrollClubDto,
  ) {
    return this.competitions.enrollClub(actor, competitionId, input);
  }

  @Get('competitions/:competitionId/rounds')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN, Role.OFFICIEL)
  listRounds(
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
  ) {
    return this.competitions.listRounds(competitionId);
  }

  @Post('competitions/:competitionId/rounds')
  @Roles(Role.LIGUE_ADMIN)
  createRound(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
    @Body() input: CreateRoundDto,
  ) {
    return this.competitions.createRound(actor, competitionId, input);
  }

  @Get('competitions/:competitionId/matches')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN, Role.OFFICIEL)
  listMatches(
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
  ) {
    return this.competitions.listMatches(competitionId);
  }

  @Post('competitions/:competitionId/matches')
  @Roles(Role.LIGUE_ADMIN)
  createMatch(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
    @Body() input: CreateMatchDto,
  ) {
    return this.competitions.createMatch(actor, competitionId, input);
  }

  @Get('venues')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN, Role.OFFICIEL)
  listVenues() {
    return this.competitions.listVenues();
  }

  @Post('venues')
  @Roles(Role.LIGUE_ADMIN)
  createVenue(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: CreateVenueDto,
  ) {
    return this.competitions.createVenue(actor, input);
  }
}
