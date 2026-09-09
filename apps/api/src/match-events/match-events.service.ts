import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MatchOfficialAssignmentStatus,
  MatchSheetStatus,
  MatchStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import {
  CreateMatchEventDto,
  LiveMatchEventType,
} from './dto/create-match-event.dto';

const EVENT_ACTION_PREFIX = 'MATCH_EVENT_';

@Injectable()
export class MatchEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedActor, matchId: string) {
    const match = await this.getAuthorizedMatch(actor, matchId, false);
    const events = await this.prisma.auditLog.findMany({
      where: {
        resourceType: 'MatchEvent',
        resourceId: matchId,
        action: { startsWith: EVENT_ACTION_PREFIX },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      match: {
        id: match.id,
        status: match.status,
        homeScore: match.homeScore ?? 0,
        awayScore: match.awayScore ?? 0,
        homeClubId: match.homeClubId,
        awayClubId: match.awayClubId,
      },
      events: events.map((event) => ({
        id: event.id,
        type: event.action.slice(EVENT_ACTION_PREFIX.length),
        createdAt: event.createdAt,
        ...(event.metadata && typeof event.metadata === 'object'
          ? (event.metadata as Record<string, unknown>)
          : {}),
      })),
    };
  }

  async create(
    actor: AuthenticatedActor,
    matchId: string,
    input: CreateMatchEventDto,
  ) {
    const match = await this.getAuthorizedMatch(actor, matchId, true);
    this.assertEventAllowed(match.status, input.type);
    this.assertClubBelongsToMatch(match, input.clubId);

    if (
      input.type === LiveMatchEventType.GOAL ||
      input.type === LiveMatchEventType.YELLOW_CARD ||
      input.type === LiveMatchEventType.RED_CARD ||
      input.type === LiveMatchEventType.SUBSTITUTION
    ) {
      if (!input.clubId || !input.registrationId) {
        throw new BadRequestException(
          'clubId et registrationId sont obligatoires pour cet événement',
        );
      }
      await this.assertPlayerOnLockedSheet(
        matchId,
        input.clubId,
        input.registrationId,
      );
    }

    if (input.type === LiveMatchEventType.SUBSTITUTION) {
      if (!input.secondaryRegistrationId) {
        throw new BadRequestException(
          'secondaryRegistrationId est obligatoire pour un remplacement',
        );
      }
      await this.assertPlayerOnLockedSheet(
        matchId,
        input.clubId!,
        input.secondaryRegistrationId,
      );
      if (input.secondaryRegistrationId === input.registrationId) {
        throw new BadRequestException(
          'Le joueur entrant doit être différent du joueur sortant',
        );
      }
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let homeScore = match.homeScore ?? 0;
      let awayScore = match.awayScore ?? 0;
      let status = match.status;

      if (input.type === LiveMatchEventType.MATCH_START) {
        status = MatchStatus.IN_PROGRESS;
        homeScore = 0;
        awayScore = 0;
      }

      if (input.type === LiveMatchEventType.GOAL) {
        if (input.clubId === match.homeClubId) homeScore += 1;
        if (input.clubId === match.awayClubId) awayScore += 1;
      }

      if (input.type === LiveMatchEventType.MATCH_END) {
        status = MatchStatus.COMPLETED;
      }

      const updatedMatch = await tx.match.update({
        where: { id: matchId },
        data: { homeScore, awayScore, status },
      });

      const event = await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: match.competition.organizationId,
          action: `${EVENT_ACTION_PREFIX}${input.type}`,
          resourceType: 'MatchEvent',
          resourceId: matchId,
          metadata: {
            minute: input.minute ?? null,
            clubId: input.clubId ?? null,
            registrationId: input.registrationId ?? null,
            secondaryRegistrationId: input.secondaryRegistrationId ?? null,
            description: input.description?.trim() || null,
            scoreAfter: { home: homeScore, away: awayScore },
          },
        },
      });

      return {
        event: {
          id: event.id,
          type: input.type,
          minute: input.minute ?? null,
          clubId: input.clubId ?? null,
          registrationId: input.registrationId ?? null,
          secondaryRegistrationId: input.secondaryRegistrationId ?? null,
          description: input.description?.trim() || null,
          createdAt: event.createdAt,
        },
        match: {
          id: updatedMatch.id,
          status: updatedMatch.status,
          homeScore: updatedMatch.homeScore ?? 0,
          awayScore: updatedMatch.awayScore ?? 0,
        },
      };
    });
  }

  private async getAuthorizedMatch(
    actor: AuthenticatedActor,
    matchId: string,
    write: boolean,
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        competition: true,
        matchSheet: true,
        officialAssignments: {
          where: {
            status: MatchOfficialAssignmentStatus.ACCEPTED,
          },
          include: {
            officialProfile: true,
          },
        },
      },
    });

    if (!match) throw new NotFoundException('Rencontre introuvable');

    const isLeagueAdmin = actor.memberships.some(
      (membership) => membership.role === Role.LIGUE_ADMIN,
    );
    const isOfficial = actor.memberships.some(
      (membership) => membership.role === Role.OFFICIEL,
    );

    if (!write && (isLeagueAdmin || isOfficial)) return match;
    if (isLeagueAdmin) return match;

    if (isOfficial) {
      const officialProfile = await this.prisma.officialProfile.findUnique({
        where: { userId: actor.userId },
      });
      const assigned = match.officialAssignments.some(
        (assignment) =>
          assignment.officialProfileId === officialProfile?.registrationId,
      );
      if (assigned) return match;
    }

    throw new ForbiddenException(
      write
        ? 'Seul un officiel affecté ou la Ligue peut saisir les événements du match'
        : 'Accès interdit à ce match',
    );
  }

  private assertEventAllowed(status: MatchStatus, type: LiveMatchEventType) {
    if (type === LiveMatchEventType.MATCH_START) {
      if (status !== MatchStatus.SCHEDULED) {
        throw new BadRequestException(
          'Le match doit être planifié avant le coup d’envoi',
        );
      }
      return;
    }

    if (status !== MatchStatus.IN_PROGRESS) {
      throw new BadRequestException('Le match doit être en cours');
    }
  }

  private assertClubBelongsToMatch(
    match: { homeClubId: string; awayClubId: string },
    clubId?: string,
  ) {
    if (!clubId) return;
    if (clubId !== match.homeClubId && clubId !== match.awayClubId) {
      throw new BadRequestException('Le club ne participe pas à cette rencontre');
    }
  }

  private async assertPlayerOnLockedSheet(
    matchId: string,
    clubId: string,
    registrationId: string,
  ) {
    const sheet = await this.prisma.matchSheet.findUnique({
      where: { matchId },
      include: {
        players: {
          where: { clubId, registrationId },
          select: { id: true },
        },
      },
    });

    if (!sheet || sheet.status !== MatchSheetStatus.LOCKED) {
      throw new BadRequestException(
        'La feuille de match doit être verrouillée avant la saisie live',
      );
    }
    if (sheet.players.length === 0) {
      throw new BadRequestException(
        'Le joueur ne figure pas sur la feuille de match verrouillée',
      );
    }
  }
}
