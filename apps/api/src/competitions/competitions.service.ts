import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompetitionFormat,
  MatchStatus,
  OrganizationType,
  Prisma,
  VenueAssignmentType,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import { TenantAccessService } from '../iam/tenant-access.service';
import { AssignClubVenueDto } from './dto/assign-club-venue.dto';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { CreateMatchDto } from './dto/create-match.dto';
import { CreateRoundDto } from './dto/create-round.dto';
import { CreateSeasonDto } from './dto/create-season.dto';
import { CreateVenueDto } from './dto/create-venue.dto';
import { CreateVenueUnavailabilityDto } from './dto/create-venue-unavailability.dto';
import { EnrollClubDto } from './dto/enroll-club.dto';
import { FixturePlannerService } from './fixture-planner.service';
import { FixtureQualityService } from './fixture-quality.service';
import { UpdatePlanningRulesDto } from './dto/update-planning-rules.dto';

@Injectable()
export class CompetitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
    private readonly fixturePlanner: FixturePlannerService,
    private readonly fixtureQuality: FixtureQualityService,
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

  async updatePlanningRules(
    actor: AuthenticatedActor,
    competitionId: string,
    input: UpdatePlanningRulesDto,
  ) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition) throw new NotFoundException('Compétition introuvable');
    this.tenantAccess.assertOrganizationAccess(actor, competition.organizationId);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.competition.update({
        where: { id: competitionId },
        data: {
          minRestHours: input.minRestHours,
          maxConsecutiveHome: input.maxConsecutiveHome,
          maxConsecutiveAway: input.maxConsecutiveAway,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: competition.organizationId,
          action: 'COMPETITION_PLANNING_RULES_UPDATED',
          resourceType: 'Competition',
          resourceId: competitionId,
          metadata: {
            minRestHours: updated.minRestHours,
            maxConsecutiveHome: updated.maxConsecutiveHome,
            maxConsecutiveAway: updated.maxConsecutiveAway,
          },
        },
      });
      return updated;
    });
  }

  async previewFixturePlan(
    actor: AuthenticatedActor,
    competitionId: string,
  ) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        entries: {
          where: { active: true },
          include: { club: { include: { organization: true } } },
          orderBy: [{ seed: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!competition) throw new NotFoundException('Compétition introuvable');
    this.tenantAccess.assertOrganizationAccess(actor, competition.organizationId);

    if (
      competition.format !== CompetitionFormat.ROUND_ROBIN &&
      competition.format !== CompetitionFormat.DOUBLE_ROUND_ROBIN
    ) {
      throw new BadRequestException(
        'Ce planificateur prend actuellement en charge les championnats',
      );
    }

    const clubs = competition.entries.map((entry) => ({
      id: entry.clubId,
      name: entry.club.shortName,
    }));
    const clubNames = new Map(clubs.map((club) => [club.id, club.name]));
    const doubleRound =
      competition.format === CompetitionFormat.DOUBLE_ROUND_ROBIN;
    const rounds = this.fixturePlanner.generateRoundRobin(clubs, doubleRound);
    const quality = this.fixtureQuality.evaluate(
      clubs,
      rounds,
      competition.maxConsecutiveHome,
      competition.maxConsecutiveAway,
      doubleRound ? 2 : 1,
    );

    return {
      competition: {
        id: competition.id,
        name: competition.name,
        format: competition.format,
      },
      generatedBy: 'RKJO_FIXTURE_PLANNER_V1',
      quality,
      constraints: [
        'Aucun club ne joue contre lui-même',
        'Une seule rencontre par club et par journée',
        'Alternance domicile et extérieur sur la phase retour',
        'Exemption automatique avec un nombre impair de clubs',
      ],
      rounds: rounds.map((round) => ({
        number: round.number,
        byeClub: round.byeClubId
          ? {
              id: round.byeClubId,
              name: clubNames.get(round.byeClubId),
            }
          : null,
        matches: round.matches.map((match) => ({
          homeClub: {
            id: match.homeClubId,
            name: clubNames.get(match.homeClubId),
          },
          awayClub: {
            id: match.awayClubId,
            name: clubNames.get(match.awayClubId),
          },
        })),
      })),
    };
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
    const unavailable = await this.prisma.venueUnavailability.findFirst({
      where: {
        venueId: input.venueId,
        startsAt: { lte: kickoffAt },
        endsAt: { gt: kickoffAt },
      },
    });
    if (unavailable) {
      throw new ConflictException(
        'Le stade est indisponible à cet horaire',
      );
    }

    const restWindowStart = new Date(
      kickoffAt.getTime() - competition.minRestHours * 60 * 60 * 1000,
    );
    const restWindowEnd = new Date(
      kickoffAt.getTime() + competition.minRestHours * 60 * 60 * 1000,
    );
    const restConflict = await this.prisma.match.findFirst({
      where: {
        kickoffAt: { gt: restWindowStart, lt: restWindowEnd },
        status: { notIn: [MatchStatus.CANCELLED, MatchStatus.POSTPONED] },
        OR: [
          { homeClubId: { in: [input.homeClubId, input.awayClubId] } },
          { awayClubId: { in: [input.homeClubId, input.awayClubId] } },
        ],
      },
    });
    if (restConflict) {
      throw new ConflictException(
        `Le repos minimal de ${competition.minRestHours} heures n’est pas respecté`,
      );
    }

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

  listClubVenues(clubId: string) {
    return this.prisma.clubVenue.findMany({
      where: { clubId, active: true },
      include: { venue: true },
      orderBy: [{ type: 'asc' }, { priority: 'asc' }],
    });
  }

  async assignClubVenue(
    actor: AuthenticatedActor,
    clubId: string,
    input: AssignClubVenueDto,
  ) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
    });
    if (!club) throw new NotFoundException('Club introuvable');

    const venue = await this.prisma.venue.findUnique({
      where: { id: input.venueId },
    });
    if (!venue || !venue.active || !venue.approved) {
      throw new BadRequestException('Le stade doit être actif et homologué');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (input.type === VenueAssignmentType.PRIMARY) {
        await tx.clubVenue.updateMany({
          where: {
            clubId,
            type: VenueAssignmentType.PRIMARY,
            venueId: { not: input.venueId },
          },
          data: { type: VenueAssignmentType.ALTERNATE },
        });
      }

      const assignment = await tx.clubVenue.upsert({
        where: { clubId_venueId: { clubId, venueId: input.venueId } },
        update: {
          type: input.type,
          priority: input.priority ?? 1,
          active: true,
        },
        create: {
          clubId,
          venueId: input.venueId,
          type: input.type,
          priority: input.priority ?? 1,
        },
        include: { venue: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: club.organizationId,
          action: 'CLUB_VENUE_ASSIGNED',
          resourceType: 'ClubVenue',
          resourceId: clubId,
          metadata: {
            venueId: input.venueId,
            type: input.type,
            priority: input.priority ?? 1,
          },
        },
      });
      return assignment;
    });
  }

  listVenueUnavailabilities(venueId: string) {
    return this.prisma.venueUnavailability.findMany({
      where: { venueId },
      orderBy: { startsAt: 'asc' },
    });
  }

  async createVenueUnavailability(
    actor: AuthenticatedActor,
    venueId: string,
    input: CreateVenueUnavailabilityDto,
  ) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
    });
    if (!venue) throw new NotFoundException('Stade introuvable');

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException(
        'La fin de l’indisponibilité doit être postérieure au début',
      );
    }

    const overlap = await this.prisma.venueUnavailability.findFirst({
      where: {
        venueId,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (overlap) {
      throw new ConflictException(
        'Cette période chevauche une indisponibilité existante',
      );
    }

    const scheduledMatch = await this.prisma.match.findFirst({
      where: {
        venueId,
        kickoffAt: { gte: startsAt, lt: endsAt },
        status: { notIn: [MatchStatus.CANCELLED, MatchStatus.POSTPONED] },
      },
    });
    if (scheduledMatch) {
      throw new ConflictException(
        'Un match est déjà programmé pendant cette période',
      );
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const unavailability = await tx.venueUnavailability.create({
        data: {
          venueId,
          startsAt,
          endsAt,
          reason: input.reason.trim(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: 'VENUE_UNAVAILABILITY_CREATED',
          resourceType: 'VenueUnavailability',
          resourceId: unavailability.id,
          metadata: { venueId, startsAt: input.startsAt, endsAt: input.endsAt },
        },
      });
      return unavailability;
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
