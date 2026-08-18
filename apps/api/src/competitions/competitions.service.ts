import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MatchStatus, OrganizationType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import { TenantAccessService } from '../iam/tenant-access.service';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { CreateMatchDto } from './dto/create-match.dto';
import { CreateRoundDto } from './dto/create-round.dto';
import { CreateSeasonDto } from './dto/create-season.dto';
import { CreateVenueDto } from './dto/create-venue.dto';
import { EnrollClubDto } from './dto/enroll-club.dto';

@Injectable()
export class CompetitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  listSeasons() {
    return this.prisma.season.findMany({
      include: { competitions: true },
      orderBy: { startDate: 'desc' },
    });
  }

  async createSeason(actor: AuthenticatedActor, input: CreateSeasonDto) {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    if (endDate <= startDate) {
      throw new BadRequestException('La fin de saison doit être postérieure au début');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const season = await tx.season.create({
        data: { name: input.name.trim(), startDate, endDate },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: 'SEASON_CREATED',
          resourceType: 'Season',
          resourceId: season.id,
          metadata: { name: season.name },
        },
      });
      return season;
    });
  }

  listCompetitions(seasonId?: string) {
    return this.prisma.competition.findMany({
      where: seasonId ? { seasonId } : undefined,
      include: {
        season: true,
        organization: true,
        entries: { include: { club: { include: { organization: true } } } },
      },
      orderBy: [{ season: { startDate: 'desc' } }, { name: 'asc' }],
    });
  }

  async createCompetition(
    actor: AuthenticatedActor,
    input: CreateCompetitionDto,
  ) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { type: true },
    });
    if (!organization) throw new NotFoundException('Organisation introuvable');
    if (organization.type !== OrganizationType.LEAGUE) {
      throw new BadRequestException('Une compétition doit être gérée par la Ligue');
    }
    this.tenantAccess.assertOrganizationAccess(actor, input.organizationId);

    const season = await this.prisma.season.findUnique({
      where: { id: input.seasonId },
    });
    if (!season) throw new NotFoundException('Saison introuvable');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const competition = await tx.competition.create({
        data: {
          organizationId: input.organizationId,
          seasonId: input.seasonId,
          name: input.name.trim(),
          code: input.code.trim().toUpperCase(),
          division: input.division,
          format: input.format,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: input.organizationId,
          action: 'COMPETITION_CREATED',
          resourceType: 'Competition',
          resourceId: competition.id,
          metadata: { name: competition.name, seasonId: input.seasonId },
        },
      });
      return competition;
    });
  }

  async enrollClub(
    actor: AuthenticatedActor,
    competitionId: string,
    input: EnrollClubDto,
  ) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition) throw new NotFoundException('Compétition introuvable');
    this.tenantAccess.assertOrganizationAccess(actor, competition.organizationId);

    const club = await this.prisma.club.findUnique({
      where: { id: input.clubId },
      include: { organization: true },
    });
    if (!club || !club.organization.active) {
      throw new NotFoundException('Club actif introuvable');
    }
    if (competition.division && club.division !== competition.division) {
      throw new BadRequestException(
        'La division du club ne correspond pas à celle de la compétition',
      );
    }

    const existing = await this.prisma.competitionClub.findUnique({
      where: {
        competitionId_clubId: {
          competitionId,
          clubId: input.clubId,
        },
      },
    });
    if (existing) {
      throw new ConflictException('Ce club est déjà engagé dans la compétition');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const entry = await tx.competitionClub.create({
        data: { competitionId, clubId: input.clubId, seed: input.seed },
        include: { club: { include: { organization: true } } },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: competition.organizationId,
          action: 'CLUB_ENROLLED_IN_COMPETITION',
          resourceType: 'CompetitionClub',
          resourceId: competitionId,
          metadata: { clubId: input.clubId, seed: input.seed },
        },
      });
      return entry;
    });
  }

  listRounds(competitionId: string) {
    return this.prisma.competitionRound.findMany({
      where: { competitionId },
      include: { matches: true },
      orderBy: { number: 'asc' },
    });
  }

  async createRound(
    actor: AuthenticatedActor,
    competitionId: string,
    input: CreateRoundDto,
  ) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
      include: { season: true },
    });
    if (!competition) throw new NotFoundException('Compétition introuvable');
    this.tenantAccess.assertOrganizationAccess(actor, competition.organizationId);

    const startDate = input.startDate ? new Date(input.startDate) : undefined;
    const endDate = input.endDate ? new Date(input.endDate) : undefined;
    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException(
        'La fin de journée doit être postérieure à son début',
      );
    }
    if (
      (startDate && startDate < competition.season.startDate) ||
      (endDate && endDate > competition.season.endDate)
    ) {
      throw new BadRequestException(
        'La journée doit se situer dans les dates de la saison',
      );
    }

    const existing = await this.prisma.competitionRound.findUnique({
      where: { competitionId_number: { competitionId, number: input.number } },
    });
    if (existing) {
      throw new ConflictException('Ce numéro de journée existe déjà');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const round = await tx.competitionRound.create({
        data: {
          competitionId,
          number: input.number,
          name: input.name?.trim(),
          startDate,
          endDate,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: competition.organizationId,
          action: 'COMPETITION_ROUND_CREATED',
          resourceType: 'CompetitionRound',
          resourceId: round.id,
          metadata: { competitionId, number: input.number },
        },
      });
      return round;
    });
  }

  listMatches(competitionId: string) {
    return this.prisma.match.findMany({
      where: { competitionId },
      include: {
        round: true,
        venue: true,
        homeClub: { include: { organization: true } },
        awayClub: { include: { organization: true } },
      },
      orderBy: [{ kickoffAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createMatch(
    actor: AuthenticatedActor,
    competitionId: string,
    input: CreateMatchDto,
  ) {
    if (input.homeClubId === input.awayClubId) {
      throw new BadRequestException(
        'Un club ne peut pas jouer contre lui-même',
      );
    }

    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition) throw new NotFoundException('Compétition introuvable');
    this.tenantAccess.assertOrganizationAccess(actor, competition.organizationId);

    const round = await this.prisma.competitionRound.findUnique({
      where: { id: input.roundId },
    });
    if (!round || round.competitionId !== competitionId) {
      throw new BadRequestException(
        'La journée ne correspond pas à cette compétition',
      );
    }

    const entries = await this.prisma.competitionClub.count({
      where: {
        competitionId,
        clubId: { in: [input.homeClubId, input.awayClubId] },
        active: true,
      },
    });
    if (entries !== 2) {
      throw new BadRequestException(
        'Les deux clubs doivent être engagés dans la compétition',
      );
    }

    const venue = await this.prisma.venue.findUnique({
      where: { id: input.venueId },
    });
    if (!venue || !venue.active || !venue.approved) {
      throw new BadRequestException('Le stade doit être actif et homologué');
    }

    const kickoffAt = new Date(input.kickoffAt);
    const conflict = await this.prisma.match.findFirst({
      where: {
        kickoffAt,
        status: { notIn: [MatchStatus.CANCELLED, MatchStatus.POSTPONED] },
        OR: [
          { venueId: input.venueId },
          { homeClubId: { in: [input.homeClubId, input.awayClubId] } },
          { awayClubId: { in: [input.homeClubId, input.awayClubId] } },
        ],
      },
    });
    if (conflict) {
      throw new ConflictException(
        'Un club ou le stade est déjà occupé à cet horaire',
      );
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const match = await tx.match.create({
        data: {
          competitionId,
          roundId: input.roundId,
          venueId: input.venueId,
          homeClubId: input.homeClubId,
          awayClubId: input.awayClubId,
          kickoffAt,
          status: MatchStatus.SCHEDULED,
        },
        include: {
          round: true,
          venue: true,
          homeClub: { include: { organization: true } },
          awayClub: { include: { organization: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: competition.organizationId,
          action: 'MATCH_SCHEDULED',
          resourceType: 'Match',
          resourceId: match.id,
          metadata: {
            competitionId,
            roundId: input.roundId,
            venueId: input.venueId,
            homeClubId: input.homeClubId,
            awayClubId: input.awayClubId,
            kickoffAt: input.kickoffAt,
          },
        },
      });
      return match;
    });
  }

  listVenues() {
    return this.prisma.venue.findMany({
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
    });
  }

  async createVenue(actor: AuthenticatedActor, input: CreateVenueDto) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const venue = await tx.venue.create({
        data: {
          name: input.name.trim(),
          city: input.city.trim(),
          address: input.address?.trim(),
          pitchSurface: input.pitchSurface?.trim(),
          capacity: input.capacity,
          approved: input.approved ?? false,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: 'VENUE_CREATED',
          resourceType: 'Venue',
          resourceId: venue.id,
          metadata: { name: venue.name, city: venue.city },
        },
      });
      return venue;
    });
  }
}
