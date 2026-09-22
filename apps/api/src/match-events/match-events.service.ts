import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MatchOfficialAssignmentStatus,
  MatchOfficialRole,
  MatchSheetStatus,
  MatchStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DisciplineService } from '../discipline/discipline.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import {
  CreateMatchEventDto,
  LiveMatchEventType,
  MatchEventPeriod,
} from './dto/create-match-event.dto';
import {
  CreatePostMatchEntryDto,
  PostMatchEntryType,
} from './dto/create-post-match-entry.dto';

const EVENT_ACTION_PREFIX = 'MATCH_EVENT_';
const POST_MATCH_ACTION_PREFIX = 'MATCH_POST_MATCH_';

@Injectable()
export class MatchEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discipline: DisciplineService,
  ) {}

  async list(actor: AuthenticatedActor, matchId: string) {
    const match = await this.getAuthorizedMatch(actor, matchId, false);
    const events = await this.prisma.auditLog.findMany({ where: { resourceType: 'MatchEvent', resourceId: matchId, action: { startsWith: EVENT_ACTION_PREFIX } }, orderBy: { createdAt: 'asc' } });
    return { match: { id: match.id, status: match.status, homeScore: match.homeScore ?? 0, awayScore: match.awayScore ?? 0, homeClubId: match.homeClubId, awayClubId: match.awayClubId }, events: events.map((event) => ({ id: event.id, type: event.action.slice(EVENT_ACTION_PREFIX.length), createdAt: event.createdAt, ...(event.metadata && typeof event.metadata === 'object' ? (event.metadata as Record<string, unknown>) : {}) })) };
  }

  async listPostMatchEntries(
    actor: AuthenticatedActor,
    matchId: string,
  ) {
    await this.getAuthorizedMatch(actor, matchId, false);

    const logs = await this.prisma.auditLog.findMany({
      where: {
        resourceType: 'MatchPostMatchEntry',
        resourceId: matchId,
        action: { startsWith: POST_MATCH_ACTION_PREFIX },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return logs.map((log) => ({
      id: log.id,
      type: log.action.slice(POST_MATCH_ACTION_PREFIX.length),
      createdAt: log.createdAt,
      actorUserId: log.actorUserId,
      ...(log.metadata && typeof log.metadata === 'object'
        ? (log.metadata as Record<string, unknown>)
        : {}),
    }));
  }

  async createPostMatchEntry(
    actor: AuthenticatedActor,
    matchId: string,
    input: CreatePostMatchEntryDto,
  ) {
    const match = await this.getAuthorizedMatch(actor, matchId, true);

    await this.assertCanCreatePostMatchEntry(
      actor,
      match,
      input.type,
    );

    if (match.status !== MatchStatus.COMPLETED) {
      throw new BadRequestException(
        'Le match doit être terminé avant la saisie post-match',
      );
    }

    const description = input.description?.trim();

    if (!description) {
      throw new BadRequestException(
        'Une description est obligatoire',
      );
    }

    if (
      input.clubId &&
      input.clubId !== match.homeClubId &&
      input.clubId !== match.awayClubId
    ) {
      throw new BadRequestException(
        'Le club indiqué ne participe pas à cette rencontre',
      );
    }

    if (
      input.type === PostMatchEntryType.TECHNICAL_RESERVE &&
      !input.clubId
    ) {
      throw new BadRequestException(
        'Un club est obligatoire pour une réserve technique',
      );
    }

    const sheet = await this.prisma.matchSheet.findUnique({
      where: { matchId },
      select: { id: true },
    });

    if (!sheet) {
      throw new BadRequestException(
        'La feuille de match est introuvable',
      );
    }

    const existingSignature = await this.prisma.auditLog.findFirst({
      where: {
        resourceType: 'MatchSheetSignature',
        resourceId: sheet.id,
        action: 'MATCH_SHEET_SIGNED',
      },
    });

    if (existingSignature) {
      throw new BadRequestException(
        'Le contenu post-match est figé dès la première signature',
      );
    }

    const closure = await this.prisma.auditLog.findFirst({
      where: {
        resourceType: 'MatchOfficialClosure',
        resourceId: matchId,
        action: 'MATCH_OFFICIALLY_CLOSED',
      },
    });

    if (closure) {
      throw new BadRequestException(
        'Le rapport officiel est définitivement clôturé',
      );
    }

    const log = await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        organizationId: match.competition.organizationId,
        action: `${POST_MATCH_ACTION_PREFIX}${input.type}`,
        resourceType: 'MatchPostMatchEntry',
        resourceId: matchId,
        metadata: {
          description,
          clubId: input.clubId ?? null,
          registrationId: input.registrationId ?? null,
        },
      },
    });

    return {
      id: log.id,
      type: input.type,
      createdAt: log.createdAt,
      ...(log.metadata && typeof log.metadata === 'object'
        ? (log.metadata as Record<string, unknown>)
        : {}),
    };
  }

  async report(actor: AuthenticatedActor, matchId: string) {
    const match = await this.getAuthorizedMatch(actor, matchId, false);

    const [sheet, logs, assignments] = await Promise.all([
      this.prisma.matchSheet.findUnique({
        where: { matchId },
        include: {
          players: {
            include: {
              registration: {
                include: {
                  person: true,
                  playerProfile: true,
                },
              },
              club: {
                include: { organization: true },
              },
            },
            orderBy: [
              { side: 'asc' },
              { role: 'asc' },
              { shirtNumber: 'asc' },
            ],
          },
        },
      }),
      this.prisma.auditLog.findMany({
        where: {
          resourceType: 'MatchEvent',
          resourceId: matchId,
          action: { startsWith: EVENT_ACTION_PREFIX },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.matchOfficialAssignment.findMany({
        where: {
          matchId,
          status: MatchOfficialAssignmentStatus.ACCEPTED,
        },
        include: {
          officialProfile: {
            include: {
              registration: {
                include: { person: true },
              },
            },
          },
        },
        orderBy: { role: 'asc' },
      }),
    ]);

    const players = sheet?.players ?? [];

    const playerByRegistrationId = new Map(
      players.map((player) => [
        player.registrationId,
        {
          registrationId: player.registrationId,
          clubId: player.clubId,
          side: player.side,
          role: player.role,
          shirtNumber: player.shirtNumber,
          firstName: player.registration.person.firstName,
          lastName: player.registration.person.lastName,
          federationId: player.registration.person.federationId,
          position: player.registration.playerProfile?.position ?? null,
          clubName: player.club.organization.name,
        },
      ]),
    );

    const events = logs.map((log) => {
      const metadata =
        log.metadata && typeof log.metadata === 'object'
          ? (log.metadata as Record<string, unknown>)
          : {};

      const registrationId =
        typeof metadata.registrationId === 'string'
          ? metadata.registrationId
          : null;

      const secondaryRegistrationId =
        typeof metadata.secondaryRegistrationId === 'string'
          ? metadata.secondaryRegistrationId
          : null;

      return {
        id: log.id,
        type: log.action.slice(EVENT_ACTION_PREFIX.length),
        createdAt: log.createdAt,
        ...metadata,
        player: registrationId
          ? playerByRegistrationId.get(registrationId) ?? null
          : null,
        secondaryPlayer: secondaryRegistrationId
          ? playerByRegistrationId.get(secondaryRegistrationId) ?? null
          : null,
      };
    });

    const postMatchLogs = await this.prisma.auditLog.findMany({
      where: {
        resourceType: 'MatchPostMatchEntry',
        resourceId: matchId,
        action: { startsWith: POST_MATCH_ACTION_PREFIX },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const postMatchEntries = postMatchLogs.map((log) => ({
      id: log.id,
      type: log.action.slice(POST_MATCH_ACTION_PREFIX.length),
      createdAt: log.createdAt,
      actorUserId: log.actorUserId,
      ...(log.metadata && typeof log.metadata === 'object'
        ? (log.metadata as Record<string, unknown>)
        : {}),
    }));

    const count = (type: LiveMatchEventType) =>
      events.filter((event) => event.type === type).length;

    const completed = match.status === MatchStatus.COMPLETED;
    const locked = sheet?.status === MatchSheetStatus.LOCKED;

    return {
      generatedAt: new Date(),
      match: {
        id: match.id,
        status: match.status,
        kickoffAt: match.kickoffAt,
        homeScore: match.homeScore ?? 0,
        awayScore: match.awayScore ?? 0,
        homeClub: {
          id: match.homeClub.id,
          organizationId: match.homeClub.organizationId,
          name: match.homeClub.shortName,
        },
        awayClub: {
          id: match.awayClub.id,
          organizationId: match.awayClub.organizationId,
          name: match.awayClub.shortName,
        },
      },
      sheet: sheet
        ? {
            id: sheet.id,
            status: sheet.status,
            lockedAt: sheet.lockedAt,
            players: players.map((player) => ({
              registrationId: player.registrationId,
              clubId: player.clubId,
              side: player.side,
              role: player.role,
              shirtNumber: player.shirtNumber,
              firstName: player.registration.person.firstName,
              lastName: player.registration.person.lastName,
              federationId: player.registration.person.federationId,
              position: player.registration.playerProfile?.position ?? null,
              clubName: player.club.organization.name,
            })),
          }
        : null,
      officials: assignments.map((assignment) => ({
        role: assignment.role,
        registrationId: assignment.officialProfile.registrationId,
        firstName:
          assignment.officialProfile.registration.person.firstName,
        lastName:
          assignment.officialProfile.registration.person.lastName,
        function: assignment.officialProfile.function,
        grade: assignment.officialProfile.grade,
      })),
      events,
      postMatchEntries,
      stats: {
        goals: count(LiveMatchEventType.GOAL),
        yellowCards: count(LiveMatchEventType.YELLOW_CARD),
        redCards: count(LiveMatchEventType.RED_CARD),
        substitutions: count(LiveMatchEventType.SUBSTITUTION),
        injuries: count(LiveMatchEventType.INJURY),
        incidents: count(LiveMatchEventType.INCIDENT),
        observations: count(LiveMatchEventType.OBSERVATION),
      },
      readiness: {
        completed,
        sheetLocked: locked,
        readyForSignatures: completed && locked,
      },
    };
  }

  async create(actor: AuthenticatedActor, matchId: string, input: CreateMatchEventDto) {
    const match = await this.getAuthorizedMatch(actor, matchId, true);
    await this.assertCanCreateEvent(actor, match, input.type);
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

      if (
        input.type === LiveMatchEventType.YELLOW_CARD &&
        input.registrationId
      ) {
        const competitionMatches = await tx.match.findMany({
          where: { competitionId: match.competition.id },
          select: { id: true },
        });

        const competitionMatchIds = competitionMatches.map(
          (competitionMatch) => competitionMatch.id,
        );

        const yellowCardLogs = await tx.auditLog.findMany({
          where: {
            resourceType: 'MatchEvent',
            resourceId: { in: competitionMatchIds },
            action: `${EVENT_ACTION_PREFIX}${LiveMatchEventType.YELLOW_CARD}`,
          },
        });

        const yellowCardCount = yellowCardLogs.filter((log) => {
          if (
            !log.metadata ||
            typeof log.metadata !== 'object' ||
            Array.isArray(log.metadata)
          ) {
            return false;
          }

          return (
            (log.metadata as Record<string, unknown>).registrationId ===
            input.registrationId
          );
        }).length;

        await this.discipline.createYellowCardSuspensionIfThresholdReached(
          {
            actorUserId: actor.userId,
            organizationId: match.competition.organizationId,
            competitionId: match.competition.id,
            registrationId: input.registrationId,
            sourceMatchId: matchId,
            sourceEventId: event.id,
            yellowCardCount,
          },
          tx,
        );
      }

      if (
        input.type === LiveMatchEventType.RED_CARD &&
        input.registrationId
      ) {
        const configuredMatches = Number(
          process.env.DISCIPLINE_RED_CARD_MATCHES ?? '1',
        );

        const matchesTotal =
          Number.isInteger(configuredMatches) && configuredMatches > 0
            ? configuredMatches
            : 1;

        await this.discipline.createSuspension(
          {
            actorUserId: actor.userId,
            organizationId: match.competition.organizationId,
            competitionId: match.competition.id,
            registrationId: input.registrationId,
            matchesTotal,
            reason: 'Carton rouge',
            source: 'RED_CARD',
            sourceMatchId: matchId,
            sourceEventId: event.id,
          },
          tx,
        );
      }

      if (input.type === LiveMatchEventType.MATCH_END) {
        await this.discipline.serveSuspensionsForCompletedMatch(
          {
            actorUserId: actor.userId,
            organizationId: match.competition.organizationId,
            competitionId: match.competition.id,
            matchId,
            homeOrganizationId: match.homeClub.organizationId,
            awayOrganizationId: match.awayClub.organizationId,
          },
          tx,
        );
      }

      return { event: { id: event.id, type: input.type, minute: input.minute ?? null, period: input.period ?? null, stoppageMinute: input.stoppageMinute ?? 0, clubId: input.clubId ?? null, registrationId: input.registrationId ?? null, secondaryRegistrationId: input.secondaryRegistrationId ?? null, description: input.description?.trim() || null, createdAt: event.createdAt }, match: { id: updatedMatch.id, status: updatedMatch.status, homeScore: updatedMatch.homeScore ?? 0, awayScore: updatedMatch.awayScore ?? 0 } };
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
        homeClub: true,
        awayClub: true,
        matchSheet: true,
        officialAssignments: {
          where: { status: MatchOfficialAssignmentStatus.ACCEPTED },
          include: { officialProfile: true },
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Rencontre introuvable');
    }

    const isLeagueAdmin = actor.memberships.some(
      (membership) => membership.role === Role.LIGUE_ADMIN,
    );

    if (isLeagueAdmin) {
      return match;
    }

    const isOfficial = actor.memberships.some(
      (membership) => membership.role === Role.OFFICIEL,
    );

    if (isOfficial) {
      const officialProfile = await this.prisma.officialProfile.findUnique({
        where: { userId: actor.userId },
        select: { registrationId: true },
      });

      const assigned =
        officialProfile &&
        match.officialAssignments.some(
          (assignment) =>
            assignment.officialProfileId === officialProfile.registrationId,
        );

      if (assigned) {
        return match;
      }
    }

    throw new ForbiddenException(
      write
        ? 'Seul un officiel affecté et confirmé ou la Ligue peut agir sur ce match'
        : 'Vous n’êtes pas désigné sur cette rencontre',
    );
  }

  private async assertCanCreatePostMatchEntry(
    actor: AuthenticatedActor,
    match: {
      officialAssignments: Array<{
        officialProfileId: string;
        role: MatchOfficialRole;
      }>;
    },
    type: PostMatchEntryType,
  ) {
    const isLeagueAdmin = actor.memberships.some(
      (membership) => membership.role === Role.LIGUE_ADMIN,
    );

    if (isLeagueAdmin) return;

    const officialProfile = await this.prisma.officialProfile.findUnique({
      where: { userId: actor.userId },
      select: { registrationId: true },
    });

    if (!officialProfile) {
      throw new ForbiddenException('Profil officiel introuvable');
    }

    const assignment = match.officialAssignments.find(
      (item) =>
        item.officialProfileId === officialProfile.registrationId,
    );

    if (!assignment) {
      throw new ForbiddenException(
        'Vous n’êtes pas désigné et confirmé sur cette rencontre',
      );
    }

    const standardPostMatchEntries = [
      PostMatchEntryType.POST_MATCH_OBSERVATION,
      PostMatchEntryType.OFFICIAL_INCIDENT_REPORT,
    ];

    const allowedByRole: Record<
      MatchOfficialRole,
      PostMatchEntryType[]
    > = {
      [MatchOfficialRole.REFEREE]: [
        PostMatchEntryType.TECHNICAL_RESERVE,
        ...standardPostMatchEntries,
      ],
      [MatchOfficialRole.ASSISTANT_REFEREE_1]:
        standardPostMatchEntries,
      [MatchOfficialRole.ASSISTANT_REFEREE_2]:
        standardPostMatchEntries,
      [MatchOfficialRole.FOURTH_OFFICIAL]:
        standardPostMatchEntries,
      [MatchOfficialRole.MATCH_COMMISSIONER]:
        standardPostMatchEntries,
      [MatchOfficialRole.DELEGATE]:
        standardPostMatchEntries,
    };

    const allowedEntries = allowedByRole[assignment.role];

    if (!allowedEntries || !allowedEntries.includes(type)) {
      throw new ForbiddenException(
        `Le rôle ${assignment.role ?? 'INCONNU'} n’est pas autorisé à enregistrer la saisie post-match ${type}`,
      );
    }
  }

  private async assertCanCreateEvent(
    actor: AuthenticatedActor,
    match: {
      officialAssignments: Array<{
        officialProfileId: string;
        role: MatchOfficialRole;
      }>;
    },
    type: LiveMatchEventType,
  ) {
    const isLeagueAdmin = actor.memberships.some(
      (membership) => membership.role === Role.LIGUE_ADMIN,
    );

    if (isLeagueAdmin) return;

    const officialProfile = await this.prisma.officialProfile.findUnique({
      where: { userId: actor.userId },
      select: { registrationId: true },
    });

    if (!officialProfile) {
      throw new ForbiddenException('Profil officiel introuvable');
    }

    const assignment = match.officialAssignments.find(
      (item) =>
        item.officialProfileId === officialProfile.registrationId,
    );

    if (!assignment) {
      throw new ForbiddenException(
        'Vous n’êtes pas désigné et confirmé sur cette rencontre',
      );
    }

    const allowedByRole: Record<
      MatchOfficialRole,
      LiveMatchEventType[]
    > = {
      [MatchOfficialRole.REFEREE]: [
        LiveMatchEventType.MATCH_START,
        LiveMatchEventType.HALF_TIME,
        LiveMatchEventType.SECOND_HALF_START,
        LiveMatchEventType.GOAL,
        LiveMatchEventType.YELLOW_CARD,
        LiveMatchEventType.RED_CARD,
        LiveMatchEventType.SUBSTITUTION,
        LiveMatchEventType.INCIDENT,
        LiveMatchEventType.INJURY,
        LiveMatchEventType.OBSERVATION,
        LiveMatchEventType.MATCH_END,
      ],
      [MatchOfficialRole.ASSISTANT_REFEREE_1]: [
        LiveMatchEventType.INCIDENT,
        LiveMatchEventType.OBSERVATION,
      ],
      [MatchOfficialRole.ASSISTANT_REFEREE_2]: [
        LiveMatchEventType.INCIDENT,
        LiveMatchEventType.OBSERVATION,
      ],
      [MatchOfficialRole.FOURTH_OFFICIAL]: [
        LiveMatchEventType.SUBSTITUTION,
        LiveMatchEventType.INCIDENT,
        LiveMatchEventType.OBSERVATION,
      ],
      [MatchOfficialRole.MATCH_COMMISSIONER]: [
        LiveMatchEventType.INCIDENT,
        LiveMatchEventType.OBSERVATION,
      ],
      [MatchOfficialRole.DELEGATE]: [
        LiveMatchEventType.INCIDENT,
        LiveMatchEventType.OBSERVATION,
      ],
    };

    const allowedEvents = allowedByRole[assignment.role];

    if (!allowedEvents || !allowedEvents.includes(type)) {
      throw new ForbiddenException(
        `Le rôle ${assignment.role ?? 'INCONNU'} n’est pas autorisé à enregistrer l’événement ${type}`,
      );
    }
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
