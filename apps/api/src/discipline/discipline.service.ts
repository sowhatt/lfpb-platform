import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const YELLOW_CARD_ACTION = 'MATCH_EVENT_YELLOW_CARD';
const RED_CARD_ACTION = 'MATCH_EVENT_RED_CARD';

const SANCTION_CREATED = 'DISCIPLINARY_SANCTION_CREATED';
const SANCTION_MATCH_SERVED = 'DISCIPLINARY_SANCTION_MATCH_SERVED';
const SANCTION_CANCELLED = 'DISCIPLINARY_SANCTION_CANCELLED';

type AuditMetadata = Record<string, unknown>;

export type ActiveSuspension = {
  matchesTotal: number;
  matchesServed: number;
  matchesRemaining: number;
  reason: string;
  startedAt: Date;
};

export type PlayerDisciplineState = {
  competitionId: string;
  registrationId: string;
  yellowCards: number;
  redCards: number;
  activeSuspension: ActiveSuspension | null;
};

@Injectable()
export class DisciplineService {
  constructor(private readonly prisma: PrismaService) {}

  async createSuspension(
    input: {
      actorUserId?: string | null;
      organizationId: string;
      competitionId: string;
      registrationId: string;
      matchesTotal: number;
      reason: string;
      source: string;
      sourceMatchId?: string | null;
      sourceEventId?: string | null;
      metadata?: Record<string, unknown>;
    },
    client: Pick<PrismaService, 'auditLog'> = this.prisma,
  ) {
    if (!Number.isInteger(input.matchesTotal) || input.matchesTotal <= 0) {
      throw new Error('Le nombre de matchs de suspension doit être supérieur à zéro');
    }

    const reason = input.reason.trim();

    if (!reason) {
      throw new Error('Le motif disciplinaire est obligatoire');
    }

    return client.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        organizationId: input.organizationId,
        action: SANCTION_CREATED,
        resourceType: 'DisciplinarySanction',
        resourceId: input.registrationId,
        metadata: {
          competitionId: input.competitionId,
          matchesTotal: input.matchesTotal,
          reason,
          source: input.source,
          sourceMatchId: input.sourceMatchId ?? null,
          sourceEventId: input.sourceEventId ?? null,
          ...(input.metadata ?? {}),
        },
      },
    });
  }

  async createYellowCardSuspensionIfThresholdReached(
    input: {
      actorUserId?: string | null;
      organizationId: string;
      competitionId: string;
      registrationId: string;
      sourceMatchId: string;
      sourceEventId: string;
      yellowCardCount: number;
    },
    client: Pick<PrismaService, 'auditLog'> = this.prisma,
  ) {
    const configuredThreshold = Number(
      process.env.DISCIPLINE_YELLOW_CARD_THRESHOLD ?? '3',
    );

    const threshold =
      Number.isInteger(configuredThreshold) && configuredThreshold > 0
        ? configuredThreshold
        : 3;

    const configuredSuspensionMatches = Number(
      process.env.DISCIPLINE_YELLOW_CARD_SUSPENSION_MATCHES ?? '1',
    );

    const suspensionMatches =
      Number.isInteger(configuredSuspensionMatches) &&
      configuredSuspensionMatches > 0
        ? configuredSuspensionMatches
        : 1;

    if (
      input.yellowCardCount <= 0 ||
      input.yellowCardCount % threshold !== 0
    ) {
      return null;
    }

    const sanctionLogs = await client.auditLog.findMany({
      where: {
        resourceType: 'DisciplinarySanction',
        resourceId: input.registrationId,
        action: SANCTION_CREATED,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const alreadyCreatedForThisThreshold = sanctionLogs.some((log) => {
      const metadata = this.metadata(log.metadata);

      return (
        metadata.competitionId === input.competitionId &&
        metadata.source === 'YELLOW_CARD_ACCUMULATION' &&
        metadata.yellowCardCount === input.yellowCardCount
      );
    });

    if (alreadyCreatedForThisThreshold) {
      return null;
    }

    return this.createSuspension(
      {
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        competitionId: input.competitionId,
        registrationId: input.registrationId,
        matchesTotal: suspensionMatches,
        reason: `Cumul de ${input.yellowCardCount} cartons jaunes`,
        source: 'YELLOW_CARD_ACCUMULATION',
        sourceMatchId: input.sourceMatchId,
        sourceEventId: input.sourceEventId,
        metadata: {
          yellowCardCount: input.yellowCardCount,
          yellowCardThreshold: threshold,
        },
      },
      client,
    );
  }

  async serveSuspensionsForCompletedMatch(
    input: {
      actorUserId?: string | null;
      organizationId: string;
      competitionId: string;
      matchId: string;
      homeOrganizationId: string;
      awayOrganizationId: string;
    },
    client: Pick<
      PrismaService,
      'match' | 'auditLog' | 'registration' | 'matchSheet'
    > = this.prisma,
  ) {
    const sheet = await client.matchSheet.findUnique({
      where: { matchId: input.matchId },
      select: {
        players: {
          select: {
            registrationId: true,
          },
        },
      },
    });

    const registrationsOnSheet = new Set(
      (sheet?.players ?? []).map((player) => player.registrationId),
    );

    const candidates = await client.registration.findMany({
      where: {
        organizationId: {
          in: [
            input.homeOrganizationId,
            input.awayOrganizationId,
          ],
        },
        category: 'PLAYER',
      },
      select: {
        id: true,
      },
    });

    const servedRegistrationIds: string[] = [];

    for (const registration of candidates) {
      if (registrationsOnSheet.has(registration.id)) {
        continue;
      }

      const state = await this.getPlayerDisciplineState(
        input.competitionId,
        registration.id,
        client,
      );

      if (!state.activeSuspension) {
        continue;
      }

      const served = await this.serveSuspensionMatch(
        {
          actorUserId: input.actorUserId,
          organizationId: input.organizationId,
          competitionId: input.competitionId,
          registrationId: registration.id,
          matchId: input.matchId,
        },
        client,
      );

      if (served) {
        servedRegistrationIds.push(registration.id);
      }
    }

    return {
      matchId: input.matchId,
      servedRegistrationIds,
      count: servedRegistrationIds.length,
    };
  }

  async serveSuspensionMatch(
    input: {
      actorUserId?: string | null;
      organizationId: string;
      competitionId: string;
      registrationId: string;
      matchId: string;
    },
    client: Pick<PrismaService, 'match' | 'auditLog'> = this.prisma,
  ) {
    const state = await this.getPlayerDisciplineState(
      input.competitionId,
      input.registrationId,
      client,
    );

    if (!state.activeSuspension) {
      return null;
    }

    const servedLogs = await client.auditLog.findMany({
      where: {
        resourceType: 'DisciplinarySanction',
        resourceId: input.registrationId,
        action: SANCTION_MATCH_SERVED,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const alreadyServed = servedLogs.some((log) => {
      const metadata = this.metadata(log.metadata);

      return (
        metadata.competitionId === input.competitionId &&
        metadata.matchId === input.matchId
      );
    });

    if (alreadyServed) {
      return null;
    }

    return client.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        organizationId: input.organizationId,
        action: SANCTION_MATCH_SERVED,
        resourceType: 'DisciplinarySanction',
        resourceId: input.registrationId,
        metadata: {
          competitionId: input.competitionId,
          matchId: input.matchId,
          matchesRemainingBefore:
            state.activeSuspension.matchesRemaining,
        },
      },
    });
  }

  async getPlayerDisciplineState(
    competitionId: string,
    registrationId: string,
    client: Pick<PrismaService, 'match' | 'auditLog'> = this.prisma,
  ): Promise<PlayerDisciplineState> {
    const matches = await client.match.findMany({
      where: { competitionId },
      select: { id: true },
    });

    const matchIds = matches.map((match) => match.id);

    const cardLogs =
      matchIds.length === 0
        ? []
        : await client.auditLog.findMany({
            where: {
              resourceType: 'MatchEvent',
              resourceId: { in: matchIds },
              action: {
                in: [YELLOW_CARD_ACTION, RED_CARD_ACTION],
              },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          });

    const playerCardLogs = cardLogs.filter((log) => {
      const metadata = this.metadata(log.metadata);
      return metadata.registrationId === registrationId;
    });

    const yellowCards = playerCardLogs.filter(
      (log) => log.action === YELLOW_CARD_ACTION,
    ).length;

    const redCards = playerCardLogs.filter(
      (log) => log.action === RED_CARD_ACTION,
    ).length;

    const sanctionLogs = await client.auditLog.findMany({
      where: {
        resourceType: 'DisciplinarySanction',
        resourceId: registrationId,
        action: {
          in: [
            SANCTION_CREATED,
            SANCTION_MATCH_SERVED,
            SANCTION_CANCELLED,
          ],
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    let activeSuspension: ActiveSuspension | null = null;

    for (const log of sanctionLogs) {
      const metadata = this.metadata(log.metadata);

      if (metadata.competitionId !== competitionId) {
        continue;
      }

      if (log.action === SANCTION_CREATED) {
        const matchesTotal = this.positiveInteger(metadata.matchesTotal);

        if (matchesTotal > 0) {
          const reason =
            typeof metadata.reason === 'string' && metadata.reason.trim()
              ? metadata.reason.trim()
              : 'Sanction disciplinaire';

          if (activeSuspension) {
            activeSuspension.matchesTotal += matchesTotal;
            activeSuspension.matchesRemaining += matchesTotal;
            activeSuspension.reason =
              `${activeSuspension.reason} + ${reason}`;
          } else {
            activeSuspension = {
              matchesTotal,
              matchesServed: 0,
              matchesRemaining: matchesTotal,
              reason,
              startedAt: log.createdAt,
            };
          }
        }
      }

      if (log.action === SANCTION_MATCH_SERVED && activeSuspension) {
        activeSuspension.matchesServed = Math.min(
          activeSuspension.matchesServed + 1,
          activeSuspension.matchesTotal,
        );

        activeSuspension.matchesRemaining = Math.max(
          activeSuspension.matchesTotal - activeSuspension.matchesServed,
          0,
        );

        if (activeSuspension.matchesRemaining === 0) {
          activeSuspension = null;
        }
      }

      if (log.action === SANCTION_CANCELLED) {
        activeSuspension = null;
      }
    }

    return {
      competitionId,
      registrationId,
      yellowCards,
      redCards,
      activeSuspension,
    };
  }

  private metadata(value: unknown): AuditMetadata {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as AuditMetadata;
  }

  private positiveInteger(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      return 0;
    }

    return value;
  }
}
