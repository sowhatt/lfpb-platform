import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MatchStatus,
  Prisma,
  ScheduleProposalStatus,
  VenueAssignmentType,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import { TenantAccessService } from '../iam/tenant-access.service';
import {
  MaterializeScheduleDto,
  ProgrammingWindowDto,
} from './dto/materialize-schedule.dto';

type ProposalMatch = {
  homeClub: { id: string; name?: string };
  awayClub: { id: string; name?: string };
};

type ProposalRound = {
  number: number;
  matches: ProposalMatch[];
};

type MaterializedMatch = {
  homeClubId: string;
  awayClubId: string;
  venueId: string;
  kickoffAt: Date;
};

type MaterializedRound = {
  number: number;
  kickoffAt: Date;
  matches: MaterializedMatch[];
};

@Injectable()
export class ScheduleMaterializationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async materialize(
    actor: AuthenticatedActor,
    proposalId: string,
    input: MaterializeScheduleDto,
  ) {
    const proposal = await this.prisma.scheduleProposal.findUnique({
      where: { id: proposalId },
      include: {
        competition: {
          include: {
            season: true,
            entries: { where: { active: true } },
          },
        },
      },
    });
    if (!proposal) throw new NotFoundException('Proposition introuvable');

    this.tenantAccess.assertOrganizationAccess(
      actor,
      proposal.competition.organizationId,
    );

    if (proposal.status !== ScheduleProposalStatus.APPROVED) {
      throw new BadRequestException(
        'Seule une proposition approuvée peut être matérialisée',
      );
    }

    const existingRounds = await this.prisma.competitionRound.count({
      where: { competitionId: proposal.competitionId },
    });
    const existingMatches = await this.prisma.match.count({
      where: { competitionId: proposal.competitionId },
    });
    if (existingRounds > 0 || existingMatches > 0) {
      throw new ConflictException(
        'Cette compétition possède déjà des journées ou rencontres. La matérialisation automatique est bloquée pour éviter tout écrasement.',
      );
    }

    const rounds = this.readRounds(proposal.payload);
    if (rounds.length === 0) {
      throw new BadRequestException(
        'La proposition approuvée ne contient aucune journée à matérialiser',
      );
    }

    const windows = this.normalizeWindows(
      input.programmingWindows,
      proposal.competition.season.startDate,
      proposal.competition.season.endDate,
    );

    const authorizedVenueIds = [...new Set(input.authorizedVenueIds)];
    const venues = await this.prisma.venue.findMany({
      where: { id: { in: authorizedVenueIds } },
    });
    if (venues.length !== authorizedVenueIds.length) {
      throw new BadRequestException(
        'Un ou plusieurs stades autorisés sont introuvables',
      );
    }
    const invalidVenue = venues.find((venue) => !venue.active || !venue.approved);
    if (invalidVenue) {
      throw new BadRequestException(
        `Le stade ${invalidVenue.name} doit être actif et homologué avant programmation`,
      );
    }

    const clubIds = proposal.competition.entries.map((entry) => entry.clubId);
    const assignments = await this.prisma.clubVenue.findMany({
      where: {
        clubId: { in: clubIds },
        venueId: { in: authorizedVenueIds },
        active: true,
      },
      include: { venue: true },
      orderBy: [{ clubId: 'asc' }, { type: 'asc' }, { priority: 'asc' }],
    });

    const assignmentsByClub = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const current = assignmentsByClub.get(assignment.clubId) ?? [];
      current.push(assignment);
      assignmentsByClub.set(assignment.clubId, current);
    }

    const homeClubIds = new Set(
      rounds.flatMap((round) => round.matches.map((match) => match.homeClub.id)),
    );
    for (const clubId of homeClubIds) {
      const eligible = assignmentsByClub.get(clubId) ?? [];
      if (eligible.length === 0) {
        throw new BadRequestException(
          `Aucun stade autorisé n’est affecté au club recevant ${clubId}`,
        );
      }
    }

    const materialized: MaterializedRound[] = [];
    let earliest = windows[0].validFrom;

    for (const round of rounds.sort((a, b) => a.number - b.number)) {
      const planned = await this.findRoundSlot(
        proposal.competitionId,
        round,
        windows,
        earliest,
        proposal.competition.minRestHours,
        assignmentsByClub,
      );
      materialized.push(planned);
      earliest = new Date(
        planned.kickoffAt.getTime() +
          proposal.competition.minRestHours * 60 * 60 * 1000,
      );
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const createdRounds = [];
      const createdMatches = [];

      for (const plannedRound of materialized) {
        const dateOnly = new Date(plannedRound.kickoffAt);
        dateOnly.setUTCHours(0, 0, 0, 0);

        const round = await tx.competitionRound.create({
          data: {
            competitionId: proposal.competitionId,
            number: plannedRound.number,
            name: `Journée ${plannedRound.number}`,
            startDate: dateOnly,
            endDate: dateOnly,
          },
        });
        createdRounds.push(round);

        for (const plannedMatch of plannedRound.matches) {
          const match = await tx.match.create({
            data: {
              competitionId: proposal.competitionId,
              roundId: round.id,
              venueId: plannedMatch.venueId,
              homeClubId: plannedMatch.homeClubId,
              awayClubId: plannedMatch.awayClubId,
              kickoffAt: plannedMatch.kickoffAt,
              status: MatchStatus.SCHEDULED,
            },
          });
          createdMatches.push(match);
        }
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: proposal.competition.organizationId,
          action: 'SCHEDULE_PROPOSAL_MATERIALIZED',
          resourceType: 'ScheduleProposal',
          resourceId: proposal.id,
          metadata: {
            competitionId: proposal.competitionId,
            version: proposal.version,
            rounds: createdRounds.length,
            matches: createdMatches.length,
            authorizedVenueIds,
            programmingWindows: input.programmingWindows,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        proposalId: proposal.id,
        competitionId: proposal.competitionId,
        roundsCreated: createdRounds.length,
        matchesCreated: createdMatches.length,
        firstKickoffAt: createdMatches[0]?.kickoffAt ?? null,
        lastKickoffAt:
          createdMatches.length > 0
            ? createdMatches[createdMatches.length - 1].kickoffAt
            : null,
      };
    });
  }

  private readRounds(payload: Prisma.JsonValue): ProposalRound[] {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
    const rounds = (payload as Prisma.JsonObject).rounds;
    if (!Array.isArray(rounds)) return [];

    return rounds.flatMap((value): ProposalRound[] => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const raw = value as Prisma.JsonObject;
      if (typeof raw.number !== 'number' || !Array.isArray(raw.matches)) return [];

      const matches = raw.matches.flatMap((matchValue): ProposalMatch[] => {
        if (!matchValue || typeof matchValue !== 'object' || Array.isArray(matchValue)) return [];
        const match = matchValue as Prisma.JsonObject;
        const homeClub = match.homeClub;
        const awayClub = match.awayClub;
        if (
          !homeClub ||
          typeof homeClub !== 'object' ||
          Array.isArray(homeClub) ||
          !awayClub ||
          typeof awayClub !== 'object' ||
          Array.isArray(awayClub)
        ) return [];

        const home = homeClub as Prisma.JsonObject;
        const away = awayClub as Prisma.JsonObject;
        if (typeof home.id !== 'string' || typeof away.id !== 'string') return [];

        return [{
          homeClub: {
            id: home.id,
            name: typeof home.name === 'string' ? home.name : undefined,
          },
          awayClub: {
            id: away.id,
            name: typeof away.name === 'string' ? away.name : undefined,
          },
        }];
      });

      if (matches.length !== raw.matches.length) return [];
      return [{ number: raw.number, matches }];
    });
  }

  private normalizeWindows(
    input: ProgrammingWindowDto[],
    seasonStart: Date,
    seasonEnd: Date,
  ) {
    const windows = input.map((window) => {
      const validFrom = new Date(window.validFrom);
      const validUntil = new Date(window.validUntil);
      validFrom.setUTCHours(0, 0, 0, 0);
      validUntil.setUTCHours(23, 59, 59, 999);

      if (validUntil < validFrom) {
        throw new BadRequestException(
          'La fin d’une fenêtre de programmation doit être postérieure à son début',
        );
      }
      if (validFrom < seasonStart || validUntil > new Date(seasonEnd.getTime() + 86_399_999)) {
        throw new BadRequestException(
          'Les fenêtres de programmation doivent rester dans les dates de la saison',
        );
      }
      if (window.startTime >= window.endTime) {
        throw new BadRequestException(
          'L’heure de fin d’une fenêtre doit être postérieure à l’heure de début',
        );
      }

      return {
        ...window,
        weekdays: [...new Set(window.weekdays)],
        validFrom,
        validUntil,
      };
    });

    return windows.sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime());
  }

  private async findRoundSlot(
    competitionId: string,
    round: ProposalRound,
    windows: ReturnType<ScheduleMaterializationService['normalizeWindows']>,
    earliest: Date,
    minRestHours: number,
    assignmentsByClub: Map<string, Array<{
      clubId: string;
      venueId: string;
      type: VenueAssignmentType;
      priority: number;
      active: boolean;
      venue: { id: string; name: string; active: boolean; approved: boolean };
    }>>,
  ): Promise<MaterializedRound> {
    const lastWindowEnd = windows.reduce(
      (latest, window) => window.validUntil > latest ? window.validUntil : latest,
      windows[0].validUntil,
    );
    const cursor = new Date(Math.max(earliest.getTime(), windows[0].validFrom.getTime()));
    cursor.setUTCHours(0, 0, 0, 0);

    for (
      let day = new Date(cursor);
      day <= lastWindowEnd;
      day = new Date(day.getTime() + 24 * 60 * 60 * 1000)
    ) {
      for (const window of windows) {
        if (day < window.validFrom || day > window.validUntil) continue;
        if (!window.weekdays.includes(day.getUTCDay())) continue;

        for (const kickoffAt of this.timeCandidates(day, window.startTime, window.endTime)) {
          if (kickoffAt < earliest) continue;

          const matches: MaterializedMatch[] = [];
          let valid = true;

          for (const match of round.matches) {
            const venueId = await this.findVenueForMatch(
              competitionId,
              match,
              kickoffAt,
              minRestHours,
              assignmentsByClub.get(match.homeClub.id) ?? [],
              matches,
            );
            if (!venueId) {
              valid = false;
              break;
            }
            matches.push({
              homeClubId: match.homeClub.id,
              awayClubId: match.awayClub.id,
              venueId,
              kickoffAt,
            });
          }

          if (valid && matches.length === round.matches.length) {
            return { number: round.number, kickoffAt, matches };
          }
        }
      }
    }

    throw new ConflictException(
      `Aucun créneau conforme n’a été trouvé pour la journée ${round.number}. Vérifiez fenêtres, stades autorisés, indisponibilités et repos minimum.`,
    );
  }

  private timeCandidates(day: Date, startTime: string, endTime: string) {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    const start = new Date(day);
    start.setUTCHours(startHour, startMinute, 0, 0);
    const end = new Date(day);
    end.setUTCHours(endHour, endMinute, 0, 0);

    const values: Date[] = [];
    for (
      let cursor = start.getTime();
      cursor <= end.getTime();
      cursor += 30 * 60 * 1000
    ) {
      values.push(new Date(cursor));
    }
    return values;
  }

  private async findVenueForMatch(
    competitionId: string,
    match: ProposalMatch,
    kickoffAt: Date,
    minRestHours: number,
    assignments: Array<{
      clubId: string;
      venueId: string;
      type: VenueAssignmentType;
      priority: number;
      active: boolean;
      venue: { id: string; name: string; active: boolean; approved: boolean };
    }>,
    plannedSameRound: MaterializedMatch[],
  ) {
    const sorted = [...assignments].sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === VenueAssignmentType.PRIMARY ? -1 : 1;
      }
      return left.priority - right.priority;
    });

    for (const assignment of sorted) {
      if (!assignment.venue.active || !assignment.venue.approved) continue;
      if (plannedSameRound.some((planned) => planned.venueId === assignment.venueId)) continue;

      const unavailable = await this.prisma.venueUnavailability.findFirst({
        where: {
          venueId: assignment.venueId,
          startsAt: { lte: kickoffAt },
          endsAt: { gt: kickoffAt },
        },
      });
      if (unavailable) continue;

      const restWindowStart = new Date(
        kickoffAt.getTime() - minRestHours * 60 * 60 * 1000,
      );
      const restWindowEnd = new Date(
        kickoffAt.getTime() + minRestHours * 60 * 60 * 1000,
      );
      const restConflict = await this.prisma.match.findFirst({
        where: {
          competitionId: { not: competitionId },
          kickoffAt: { gt: restWindowStart, lt: restWindowEnd },
          status: { notIn: [MatchStatus.CANCELLED, MatchStatus.POSTPONED] },
          OR: [
            { homeClubId: { in: [match.homeClub.id, match.awayClub.id] } },
            { awayClubId: { in: [match.homeClub.id, match.awayClub.id] } },
          ],
        },
      });
      if (restConflict) continue;

      const conflict = await this.prisma.match.findFirst({
        where: {
          kickoffAt,
          status: { notIn: [MatchStatus.CANCELLED, MatchStatus.POSTPONED] },
          OR: [
            { venueId: assignment.venueId },
            { homeClubId: { in: [match.homeClub.id, match.awayClub.id] } },
            { awayClubId: { in: [match.homeClub.id, match.awayClub.id] } },
          ],
        },
      });
      if (conflict) continue;

      return assignment.venueId;
    }

    return null;
  }
}
