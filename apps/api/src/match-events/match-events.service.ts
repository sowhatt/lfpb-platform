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
  MatchEventPeriod,
} from './dto/create-match-event.dto';

const EVENT_ACTION_PREFIX = 'MATCH_EVENT_';

@Injectable()
export class MatchEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedActor, matchId: string) {
    const match = await this.getAuthorizedMatch(actor, matchId, false);
    const events = await this.prisma.auditLog.findMany({ where: { resourceType: 'MatchEvent', resourceId: matchId, action: { startsWith: EVENT_ACTION_PREFIX } }, orderBy: { createdAt: 'asc' } });
    return { match: { id: match.id, status: match.status, homeScore: match.homeScore ?? 0, awayScore: match.awayScore ?? 0, homeClubId: match.homeClubId, awayClubId: match.awayClubId }, events: events.map((event) => ({ id: event.id, type: event.action.slice(EVENT_ACTION_PREFIX.length), createdAt: event.createdAt, ...(event.metadata && typeof event.metadata === 'object' ? (event.metadata as Record<string, unknown>) : {}) })) };
  }

  async create(actor: AuthenticatedActor, matchId: string, input: CreateMatchEventDto) {
    const match = await this.getAuthorizedMatch(actor, matchId, true);
    this.assertEventAllowed(match.status, input.type);
    await this.assertLifecycleSequence(matchId, input.type);
    this.assertClubBelongsToMatch(match, input.clubId);

    if (
      input.type === LiveMatchEventType.INCIDENT ||
      input.type === LiveMatchEventType.OBSERVATION
    ) {
      if (!input.description?.trim()) {
        throw new BadRequestException(
          'Une description est obligatoire pour cet événement',
        );
      }
    }

    if (input.type === LiveMatchEventType.INJURY) {
      if (!input.clubId || !input.registrationId) {
        throw new BadRequestException(
          'clubId et registrationId sont obligatoires pour une blessure',
        );
      }

      if (!input.description?.trim()) {
        throw new BadRequestException(
          'Une description est obligatoire pour une blessure',
        );
      }

      await this.assertPlayerOnLockedSheet(
        matchId,
        input.clubId,
        input.registrationId,
      );
    }

    if (input.type === LiveMatchEventType.GOAL) {
      if (!input.clubId || !input.registrationId) {
        throw new BadRequestException(
          'clubId et registrationId sont obligatoires pour un but',
        );
      }

      await this.assertValidGoal(
        matchId,
        input.clubId,
        input.registrationId,
        input.period,
      );
    }
    if ([LiveMatchEventType.GOAL, LiveMatchEventType.YELLOW_CARD, LiveMatchEventType.RED_CARD, LiveMatchEventType.SUBSTITUTION].includes(input.type)) {
      if (!input.clubId || !input.registrationId) throw new BadRequestException('clubId et registrationId sont obligatoires pour cet événement');
      await this.assertPlayerOnLockedSheet(matchId, input.clubId, input.registrationId);
    }
    if (input.type === LiveMatchEventType.SUBSTITUTION) {
      if (!input.secondaryRegistrationId) throw new BadRequestException('secondaryRegistrationId est obligatoire pour un remplacement');
      await this.assertPlayerOnLockedSheet(matchId, input.clubId!, input.secondaryRegistrationId);
      if (input.secondaryRegistrationId === input.registrationId) throw new BadRequestException('Le joueur entrant doit être différent du joueur sortant');

      await this.assertValidSubstitution(
        matchId,
        input.clubId!,
        input.registrationId!,
        input.secondaryRegistrationId,
      );
    }
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let homeScore = match.homeScore ?? 0; let awayScore = match.awayScore ?? 0; let status = match.status;
      if (input.type === LiveMatchEventType.MATCH_START) { status = MatchStatus.IN_PROGRESS; homeScore = 0; awayScore = 0; }
      if (input.type === LiveMatchEventType.GOAL) { if (input.clubId === match.homeClubId) homeScore += 1; if (input.clubId === match.awayClubId) awayScore += 1; }
      if (input.type === LiveMatchEventType.MATCH_END) status = MatchStatus.COMPLETED;
      const updatedMatch = await tx.match.update({ where: { id: matchId }, data: { homeScore, awayScore, status } });
      const event = await tx.auditLog.create({ data: { actorUserId: actor.userId, organizationId: match.competition.organizationId, action: `${EVENT_ACTION_PREFIX}${input.type}`, resourceType: 'MatchEvent', resourceId: matchId, metadata: { minute: input.minute ?? null, period: input.period ?? null, stoppageMinute: input.stoppageMinute ?? 0, clubId: input.clubId ?? null, registrationId: input.registrationId ?? null, secondaryRegistrationId: input.secondaryRegistrationId ?? null, description: input.description?.trim() || null, scoreAfter: { home: homeScore, away: awayScore } } } });
      return { event: { id: event.id, type: input.type, minute: input.minute ?? null, period: input.period ?? null, stoppageMinute: input.stoppageMinute ?? 0, clubId: input.clubId ?? null, registrationId: input.registrationId ?? null, secondaryRegistrationId: input.secondaryRegistrationId ?? null, description: input.description?.trim() || null, createdAt: event.createdAt }, match: { id: updatedMatch.id, status: updatedMatch.status, homeScore: updatedMatch.homeScore ?? 0, awayScore: updatedMatch.awayScore ?? 0 } };
    });
  }

  private async getAuthorizedMatch(actor: AuthenticatedActor, matchId: string, write: boolean) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId }, include: { competition: true, matchSheet: true, officialAssignments: { where: { status: MatchOfficialAssignmentStatus.ACCEPTED }, include: { officialProfile: true } } } });
    if (!match) throw new NotFoundException('Rencontre introuvable');
    const isLeagueAdmin = actor.memberships.some((membership) => membership.role === Role.LIGUE_ADMIN); const isOfficial = actor.memberships.some((membership) => membership.role === Role.OFFICIEL);
    if (!write && (isLeagueAdmin || isOfficial)) return match; if (isLeagueAdmin) return match;
    if (isOfficial) { const officialProfile = await this.prisma.officialProfile.findUnique({ where: { userId: actor.userId } }); const assigned = match.officialAssignments.some((assignment) => assignment.officialProfileId === officialProfile?.registrationId); if (assigned) return match; }
    throw new ForbiddenException(write ? 'Seul un officiel affecté ou la Ligue peut saisir les événements du match' : 'Accès interdit à ce match');
  }

  private assertEventAllowed(status: MatchStatus, type: LiveMatchEventType) { if (type === LiveMatchEventType.MATCH_START) { if (status !== MatchStatus.SCHEDULED) throw new BadRequestException('Le match doit être planifié avant le coup d’envoi'); return; } if (status !== MatchStatus.IN_PROGRESS) throw new BadRequestException('Le match doit être en cours'); }
  private async assertLifecycleSequence(
    matchId: string,
    type: LiveMatchEventType,
  ) {
    const lifecycleTypes = [
      LiveMatchEventType.MATCH_START,
      LiveMatchEventType.HALF_TIME,
      LiveMatchEventType.SECOND_HALF_START,
      LiveMatchEventType.MATCH_END,
    ];

    if (!lifecycleTypes.includes(type)) return;

    if (type === LiveMatchEventType.MATCH_START) return;

    const events = await this.prisma.auditLog.findMany({
      where: {
        resourceType: 'MatchEvent',
        resourceId: matchId,
        action: {
          in: lifecycleTypes.map(
            (eventType) => `${EVENT_ACTION_PREFIX}${eventType}`,
          ),
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const history = events.map((event) =>
      event.action.slice(EVENT_ACTION_PREFIX.length),
    );

    const hasStarted = history.includes(LiveMatchEventType.MATCH_START);
    const hasHalfTime = history.includes(LiveMatchEventType.HALF_TIME);
    const hasSecondHalf = history.includes(
      LiveMatchEventType.SECOND_HALF_START,
    );
    const hasEnded = history.includes(LiveMatchEventType.MATCH_END);

    if (hasEnded) {
      throw new BadRequestException('Le match est déjà terminé');
    }

    if (!hasStarted) {
      throw new BadRequestException(
        'Le coup d’envoi doit être enregistré avant cet événement',
      );
    }

    if (type === LiveMatchEventType.HALF_TIME) {
      if (hasHalfTime || hasSecondHalf) {
        throw new BadRequestException(
          'La mi-temps a déjà été enregistrée',
        );
      }
      return;
    }

    if (type === LiveMatchEventType.SECOND_HALF_START) {
      if (!hasHalfTime) {
        throw new BadRequestException(
          'La mi-temps doit être enregistrée avant la reprise',
        );
      }

      if (hasSecondHalf) {
        throw new BadRequestException(
          'La deuxième mi-temps a déjà commencé',
        );
      }
      return;
    }

    if (type === LiveMatchEventType.MATCH_END && !hasSecondHalf) {
      throw new BadRequestException(
        'La deuxième mi-temps doit avoir commencé avant la fin du match',
      );
    }
  }

  private async assertValidGoal(
    matchId: string,
    clubId: string,
    registrationId: string,
    period?: MatchEventPeriod,
  ) {
    const lifecycleEvents = await this.prisma.auditLog.findMany({
      where: {
        resourceType: 'MatchEvent',
        resourceId: matchId,
        action: {
          in: [
            `${EVENT_ACTION_PREFIX}${LiveMatchEventType.MATCH_START}`,
            `${EVENT_ACTION_PREFIX}${LiveMatchEventType.HALF_TIME}`,
            `${EVENT_ACTION_PREFIX}${LiveMatchEventType.SECOND_HALF_START}`,
            `${EVENT_ACTION_PREFIX}${LiveMatchEventType.MATCH_END}`,
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const history = lifecycleEvents.map((event) =>
      event.action.slice(EVENT_ACTION_PREFIX.length),
    );

    const hasStarted = history.includes(LiveMatchEventType.MATCH_START);
    const hasHalfTime = history.includes(LiveMatchEventType.HALF_TIME);
    const hasSecondHalf = history.includes(
      LiveMatchEventType.SECOND_HALF_START,
    );
    const hasEnded = history.includes(LiveMatchEventType.MATCH_END);

    if (!hasStarted || hasEnded) {
      throw new BadRequestException(
        'Un but ne peut être enregistré que pendant le jeu',
      );
    }

    let authoritativePeriod: MatchEventPeriod;

    if (!hasHalfTime) {
      authoritativePeriod = MatchEventPeriod.FIRST_HALF;
    } else if (!hasSecondHalf) {
      throw new BadRequestException(
        'Un but ne peut pas être enregistré pendant la mi-temps',
      );
    } else {
      authoritativePeriod = MatchEventPeriod.SECOND_HALF;
    }

    if (period && period !== authoritativePeriod) {
      throw new BadRequestException(
        'La période du but ne correspond pas à la phase actuelle du match',
      );
    }

    const { onField } = await this.getPlayerState(matchId, clubId);

    if (!onField.has(registrationId)) {
      throw new BadRequestException(
        'Le buteur n’est pas actuellement sur le terrain',
      );
    }
  }

  private async getPlayerState(matchId: string, clubId: string) {
    const sheet = await this.prisma.matchSheet.findUnique({
      where: { matchId },
      include: {
        players: {
          where: { clubId },
          select: {
            registrationId: true,
            role: true,
          },
        },
      },
    });

    if (!sheet || sheet.status !== MatchSheetStatus.LOCKED) {
      throw new BadRequestException(
        'La feuille de match doit être verrouillée avant la saisie live',
      );
    }

    const onField = new Set(
      sheet.players
        .filter((player) => player.role === 'STARTER')
        .map((player) => player.registrationId),
    );

    const sentOff = new Set<string>();

    const events = await this.prisma.auditLog.findMany({
      where: {
        resourceType: 'MatchEvent',
        resourceId: matchId,
        action: {
          in: [
            `${EVENT_ACTION_PREFIX}${LiveMatchEventType.SUBSTITUTION}`,
            `${EVENT_ACTION_PREFIX}${LiveMatchEventType.RED_CARD}`,
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const event of events) {
      if (!event.metadata || typeof event.metadata !== 'object') continue;

      const metadata = event.metadata as Record<string, unknown>;

      if (metadata.clubId !== clubId) continue;

      if (
        event.action ===
        `${EVENT_ACTION_PREFIX}${LiveMatchEventType.SUBSTITUTION}`
      ) {
        const outgoing = metadata.registrationId;
        const incoming = metadata.secondaryRegistrationId;

        if (typeof outgoing === 'string') onField.delete(outgoing);
        if (typeof incoming === 'string') onField.add(incoming);
      }

      if (
        event.action ===
        `${EVENT_ACTION_PREFIX}${LiveMatchEventType.RED_CARD}`
      ) {
        const playerId = metadata.registrationId;

        if (typeof playerId === 'string') {
          sentOff.add(playerId);
          onField.delete(playerId);
        }
      }
    }

    return { onField, sentOff };
  }

  private assertClubBelongsToMatch(match: { homeClubId: string; awayClubId: string }, clubId?: string) { if (!clubId) return; if (clubId !== match.homeClubId && clubId !== match.awayClubId) throw new BadRequestException('Le club ne participe pas à cette rencontre'); }
  private async assertValidSubstitution(
    matchId: string,
    clubId: string,
    outgoingRegistrationId: string,
    incomingRegistrationId: string,
  ) {
    const { onField, sentOff } = await this.getPlayerState(matchId, clubId);

    if (sentOff.has(outgoingRegistrationId)) {
      throw new BadRequestException(
        'Le joueur sortant a déjà été expulsé',
      );
    }

    if (sentOff.has(incomingRegistrationId)) {
      throw new BadRequestException(
        'Le joueur entrant a déjà été expulsé',
      );
    }

    if (!onField.has(outgoingRegistrationId)) {
      throw new BadRequestException(
        'Le joueur sortant n’est pas actuellement sur le terrain',
      );
    }

    if (onField.has(incomingRegistrationId)) {
      throw new BadRequestException(
        'Le joueur entrant est déjà sur le terrain',
      );
    }
  }

  private async assertPlayerOnLockedSheet(matchId: string, clubId: string, registrationId: string) { const sheet = await this.prisma.matchSheet.findUnique({ where: { matchId }, include: { players: { where: { clubId, registrationId }, select: { id: true } } } }); if (!sheet || sheet.status !== MatchSheetStatus.LOCKED) throw new BadRequestException('La feuille de match doit être verrouillée avant la saisie live'); if (sheet.players.length === 0) throw new BadRequestException('Le joueur ne figure pas sur la feuille de match verrouillée'); }
}
