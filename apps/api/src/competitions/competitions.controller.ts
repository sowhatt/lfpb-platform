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
import { CompetitionsService } from './competitions.service';
import { AssignClubVenueDto } from './dto/assign-club-venue.dto';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { CreateMatchDto } from './dto/create-match.dto';
import { CreateRoundDto } from './dto/create-round.dto';
import { CreateSeasonDto } from './dto/create-season.dto';
import { CreateVenueDto } from './dto/create-venue.dto';
import { CreateVenueUnavailabilityDto } from './dto/create-venue-unavailability.dto';
import { EnrollClubDto } from './dto/enroll-club.dto';
import { UpdatePlanningRulesDto } from './dto/update-planning-rules.dto';

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

  @Patch('competitions/:competitionId/planning-rules')
  @Roles(Role.LIGUE_ADMIN)
  updatePlanningRules(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
    @Body() input: UpdatePlanningRulesDto,
  ) {
    return this.competitions.updatePlanningRules(
      actor,
      competitionId,
      input,
    );
  }

  @Get('competitions/:competitionId/fixture-plan/preview')
  @Roles(Role.LIGUE_ADMIN)
  previewFixturePlan(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
  ) {
    return this.competitions.previewFixturePlan(actor, competitionId);
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

  @Get('clubs/:clubId/venues')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN, Role.OFFICIEL)
  listClubVenues(@Param('clubId', ParseUUIDPipe) clubId: string) {
    return this.competitions.listClubVenues(clubId);
  }

  @Post('clubs/:clubId/venues')
  @Roles(Role.LIGUE_ADMIN)
  assignClubVenue(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Body() input: AssignClubVenueDto,
  ) {
    return this.competitions.assignClubVenue(actor, clubId, input);
  }

  @Get('venues/:venueId/unavailabilities')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN, Role.OFFICIEL)
  listVenueUnavailabilities(
    @Param('venueId', ParseUUIDPipe) venueId: string,
  ) {
    return this.competitions.listVenueUnavailabilities(venueId);
  }

  @Post('venues/:venueId/unavailabilities')
  @Roles(Role.LIGUE_ADMIN)
  createVenueUnavailability(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @Body() input: CreateVenueUnavailabilityDto,
  ) {
    return this.competitions.createVenueUnavailability(actor, venueId, input);
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
