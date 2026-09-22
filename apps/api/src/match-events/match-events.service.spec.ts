import { BadRequestException } from '@nestjs/common';
import {
  MatchOfficialRole,
  MatchSheetPlayerRole,
  MatchSheetStatus,
  MatchStatus,
  Role,
} from '@prisma/client';
import { MatchEventsService } from './match-events.service';
import {
  LiveMatchEventType,
  MatchEventPeriod,
} from './dto/create-match-event.dto';

describe('MatchEventsService - substitutions', () => {
  const actor = {
    userId: 'official-user',
    memberships: [
      {
        role: Role.OFFICIEL,
        organizationId: 'league-org',
      },
    ],
  } as any;

  const match = {
    id: 'match-1',
    status: MatchStatus.IN_PROGRESS,
    homeScore: 0,
    awayScore: 0,
    homeClubId: 'home-club',
    awayClubId: 'away-club',
    competition: {
      id: 'competition-1',
      organizationId: 'league-org',
    },
    matchSheet: { status: MatchSheetStatus.LOCKED },
    officialAssignments: [
      {
        officialProfileId: 'official-registration',
        role: MatchOfficialRole.REFEREE,
      },
    ],
  };

  function makePrisma(events: any[] = []) {
    return {
      match: {
        findUnique: jest.fn().mockResolvedValue(match),
      },
      officialProfile: {
        findUnique: jest.fn().mockResolvedValue({
          registrationId: 'official-registration',
        }),
      },
      matchSheet: {
        findUnique: jest.fn().mockImplementation(({ include }: any) => {
          const where = include?.players?.where;

          if (where?.registrationId) {
            const roles: Record<string, MatchSheetPlayerRole> = {
              starter1: MatchSheetPlayerRole.STARTER,
              starter2: MatchSheetPlayerRole.STARTER,
              sub1: MatchSheetPlayerRole.SUBSTITUTE,
              sub2: MatchSheetPlayerRole.SUBSTITUTE,
            };

            const role = roles[where.registrationId];

            return Promise.resolve({
              status: MatchSheetStatus.LOCKED,
              players:
                role && where.clubId === 'home-club'
                  ? [{ id: `sheet-${where.registrationId}`, role }]
                  : [],
            });
          }

          return Promise.resolve({
            status: MatchSheetStatus.LOCKED,
            players: [
              {
                registrationId: 'starter1',
                clubId: 'home-club',
                role: MatchSheetPlayerRole.STARTER,
              },
              {
                registrationId: 'starter2',
                clubId: 'home-club',
                role: MatchSheetPlayerRole.STARTER,
              },
              {
                registrationId: 'sub1',
                clubId: 'home-club',
                role: MatchSheetPlayerRole.SUBSTITUTE,
              },
              {
                registrationId: 'sub2',
                clubId: 'home-club',
                role: MatchSheetPlayerRole.SUBSTITUTE,
              },
            ],
          });
        }),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue(events),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    } as any;
  }

  it('accepte un remplacement titulaire vers remplaçant', async () => {
    const prisma = makePrisma();
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        match: {
          update: jest.fn().mockResolvedValue(match),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({
            id: 'event-1',
            createdAt: new Date(),
          }),
        },
      }),
    );

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.SUBSTITUTION,
        clubId: 'home-club',
        registrationId: 'starter1',
        secondaryRegistrationId: 'sub1',
        minute: 60,
      }),
    ).resolves.toBeDefined();
  });

  it('refuse de faire sortir un joueur déjà sorti', async () => {
    const prisma = makePrisma([
      {
        action: 'MATCH_EVENT_SUBSTITUTION',
        metadata: {
          clubId: 'home-club',
          registrationId: 'starter1',
          secondaryRegistrationId: 'sub1',
        },
      },
    ]);

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.SUBSTITUTION,
        clubId: 'home-club',
        registrationId: 'starter1',
        secondaryRegistrationId: 'sub2',
        minute: 70,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse de faire entrer un joueur déjà entré', async () => {
    const prisma = makePrisma([
      {
        action: 'MATCH_EVENT_SUBSTITUTION',
        metadata: {
          clubId: 'home-club',
          registrationId: 'starter1',
          secondaryRegistrationId: 'sub1',
        },
      },
    ]);

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.SUBSTITUTION,
        clubId: 'home-club',
        registrationId: 'starter2',
        secondaryRegistrationId: 'sub1',
        minute: 70,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse de faire sortir un remplaçant qui n’est jamais entré', async () => {
    const prisma = makePrisma();
    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.SUBSTITUTION,
        clubId: 'home-club',
        registrationId: 'sub1',
        secondaryRegistrationId: 'sub2',
        minute: 65,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepte qu’un remplaçant entré sur le terrain sorte ensuite', async () => {
    const prisma = makePrisma([
      {
        action: 'MATCH_EVENT_SUBSTITUTION',
        metadata: {
          clubId: 'home-club',
          registrationId: 'starter1',
          secondaryRegistrationId: 'sub1',
        },
      },
    ]);

    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        match: {
          update: jest.fn().mockResolvedValue(match),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({
            id: 'event-2',
            createdAt: new Date(),
          }),
        },
      }),
    );

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.SUBSTITUTION,
        clubId: 'home-club',
        registrationId: 'sub1',
        secondaryRegistrationId: 'sub2',
        minute: 75,
      }),
    ).resolves.toBeDefined();
  });


  it('refuse de remplacer un joueur déjà expulsé', async () => {
    const prisma = makePrisma([
      {
        action: 'MATCH_EVENT_RED_CARD',
        metadata: {
          clubId: 'home-club',
          registrationId: 'starter1',
        },
      },
    ]);

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.SUBSTITUTION,
        clubId: 'home-club',
        registrationId: 'starter1',
        secondaryRegistrationId: 'sub1',
        minute: 70,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse de faire entrer un remplaçant déjà expulsé', async () => {
    const prisma = makePrisma([
      {
        action: 'MATCH_EVENT_RED_CARD',
        metadata: {
          clubId: 'home-club',
          registrationId: 'sub1',
        },
      },
    ]);

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.SUBSTITUTION,
        clubId: 'home-club',
        registrationId: 'starter1',
        secondaryRegistrationId: 'sub1',
        minute: 70,
      }),
    ).rejects.toThrow(BadRequestException);
  });


  it('refuse de remplacer un remplaçant entré puis expulsé', async () => {
    const prisma = makePrisma([
      {
        action: 'MATCH_EVENT_SUBSTITUTION',
        metadata: {
          clubId: 'home-club',
          registrationId: 'starter1',
          secondaryRegistrationId: 'sub1',
        },
      },
      {
        action: 'MATCH_EVENT_RED_CARD',
        metadata: {
          clubId: 'home-club',
          registrationId: 'sub1',
        },
      },
    ]);

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.SUBSTITUTION,
        clubId: 'home-club',
        registrationId: 'sub1',
        secondaryRegistrationId: 'sub2',
        minute: 80,
      }),
    ).rejects.toThrow(BadRequestException);
  });

});

describe('MatchEventsService - lifecycle', () => {
  const actor = {
    userId: 'league-admin',
    memberships: [
      {
        role: Role.LIGUE_ADMIN,
        organizationId: 'league-org',
      },
    ],
  } as any;

  function makeLifecyclePrisma(
    status: MatchStatus,
    events: any[] = [],
  ) {
    const lifecycleMatch = {
      id: 'match-1',
      status,
      homeScore: 0,
      awayScore: 0,
      homeClubId: 'home-club',
      awayClubId: 'away-club',
      homeClub: { organizationId: 'home-org' },
      awayClub: { organizationId: 'away-org' },
      competition: {
        id: 'competition-1',
        organizationId: 'league-org',
      },
      matchSheet: { status: MatchSheetStatus.LOCKED },
      officialAssignments: [],
    };

    return {
      match: {
        findUnique: jest.fn().mockResolvedValue(lifecycleMatch),
      },
      officialProfile: {
        findUnique: jest.fn(),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue(events),
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (callback: any) =>
        callback({
          match: {
            update: jest.fn().mockImplementation(({ data }: any) =>
              Promise.resolve({
                ...lifecycleMatch,
                ...data,
              }),
            ),
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({
              id: 'event-lifecycle',
              createdAt: new Date(),
            }),
          },
        }),
      ),
    } as any;
  }

  it('refuse la mi-temps sans coup d’envoi', async () => {
    const prisma = makeLifecyclePrisma(MatchStatus.IN_PROGRESS, []);
    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.HALF_TIME,
        minute: 45,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse la reprise avant la mi-temps', async () => {
    const prisma = makeLifecyclePrisma(MatchStatus.IN_PROGRESS, [
      { action: 'MATCH_EVENT_MATCH_START', metadata: {} },
    ]);
    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.SECOND_HALF_START,
        minute: 45,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse une deuxième mi-temps', async () => {
    const prisma = makeLifecyclePrisma(MatchStatus.IN_PROGRESS, [
      { action: 'MATCH_EVENT_MATCH_START', metadata: {} },
      { action: 'MATCH_EVENT_HALF_TIME', metadata: {} },
    ]);
    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.HALF_TIME,
        minute: 46,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse une deuxième reprise', async () => {
    const prisma = makeLifecyclePrisma(MatchStatus.IN_PROGRESS, [
      { action: 'MATCH_EVENT_MATCH_START', metadata: {} },
      { action: 'MATCH_EVENT_HALF_TIME', metadata: {} },
      { action: 'MATCH_EVENT_SECOND_HALF_START', metadata: {} },
    ]);
    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.SECOND_HALF_START,
        minute: 46,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse la fin du match avant la deuxième mi-temps', async () => {
    const prisma = makeLifecyclePrisma(MatchStatus.IN_PROGRESS, [
      { action: 'MATCH_EVENT_MATCH_START', metadata: {} },
      { action: 'MATCH_EVENT_HALF_TIME', metadata: {} },
    ]);
    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.MATCH_END,
        minute: 45,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepte la mi-temps après le coup d’envoi', async () => {
    const prisma = makeLifecyclePrisma(MatchStatus.IN_PROGRESS, [
      { action: 'MATCH_EVENT_MATCH_START', metadata: {} },
    ]);
    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.HALF_TIME,
        minute: 45,
      }),
    ).resolves.toBeDefined();
  });

  it('accepte la reprise après la mi-temps', async () => {
    const prisma = makeLifecyclePrisma(MatchStatus.IN_PROGRESS, [
      { action: 'MATCH_EVENT_MATCH_START', metadata: {} },
      { action: 'MATCH_EVENT_HALF_TIME', metadata: {} },
    ]);
    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.SECOND_HALF_START,
        minute: 45,
      }),
    ).resolves.toBeDefined();
  });

  it('accepte la fin après le début de la deuxième mi-temps', async () => {
    const prisma = makeLifecyclePrisma(MatchStatus.IN_PROGRESS, [
      { action: 'MATCH_EVENT_MATCH_START', metadata: {} },
      { action: 'MATCH_EVENT_HALF_TIME', metadata: {} },
      { action: 'MATCH_EVENT_SECOND_HALF_START', metadata: {} },
    ]);
    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.MATCH_END,
        minute: 90,
      }),
    ).resolves.toBeDefined();
  });
});


describe('MatchEventsService - live integrity', () => {
  const actor = {
    userId: 'league-admin',
    memberships: [
      {
        role: Role.LIGUE_ADMIN,
        organizationId: 'league-org',
      },
    ],
  } as any;

  const match = {
    id: 'match-1',
    status: MatchStatus.IN_PROGRESS,
    homeScore: 0,
    awayScore: 0,
    homeClubId: 'home-club',
    awayClubId: 'away-club',
    competition: { organizationId: 'league-org' },
    matchSheet: { status: MatchSheetStatus.LOCKED },
    officialAssignments: [],
  };

  function event(type: LiveMatchEventType, metadata: any = {}) {
    return {
      action: `MATCH_EVENT_${type}`,
      metadata,
      createdAt: new Date(),
    };
  }

  function makeIntegrityPrisma(events: any[]) {
    return {
      match: {
        findUnique: jest.fn().mockResolvedValue(match),
      },
      officialProfile: {
        findUnique: jest.fn(),
      },
      matchSheet: {
        findUnique: jest.fn().mockImplementation(({ include }: any) => {
          const where = include?.players?.where;

          if (where?.registrationId) {
            const known = ['starter1', 'starter2', 'sub1', 'sub2'];

            return Promise.resolve({
              status: MatchSheetStatus.LOCKED,
              players:
                where.clubId === 'home-club' &&
                known.includes(where.registrationId)
                  ? [{ id: `sheet-${where.registrationId}` }]
                  : [],
            });
          }

          return Promise.resolve({
            status: MatchSheetStatus.LOCKED,
            players: [
              {
                registrationId: 'starter1',
                role: MatchSheetPlayerRole.STARTER,
              },
              {
                registrationId: 'starter2',
                role: MatchSheetPlayerRole.STARTER,
              },
              {
                registrationId: 'sub1',
                role: MatchSheetPlayerRole.SUBSTITUTE,
              },
              {
                registrationId: 'sub2',
                role: MatchSheetPlayerRole.SUBSTITUTE,
              },
            ],
          });
        }),
      },
      auditLog: {
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          const allowed = where?.action?.in;

          if (!Array.isArray(allowed)) return Promise.resolve(events);

          return Promise.resolve(
            events.filter((item) => allowed.includes(item.action)),
          );
        }),
      },
      $transaction: jest.fn().mockImplementation(async (callback: any) =>
        callback({
          match: {
            findMany: jest.fn().mockResolvedValue([
              { id: 'match-1' },
            ]),
            update: jest.fn().mockImplementation(({ data }: any) =>
              Promise.resolve({
                ...match,
                ...data,
              }),
            ),
          },
          auditLog: {
            findMany: jest.fn().mockImplementation(({ where }: any) => {
              if (typeof where?.action === 'string') {
                return Promise.resolve(
                  events.filter((item) => item.action === where.action),
                );
              }

              return Promise.resolve(events);
            }),
            create: jest.fn().mockResolvedValue({
              id: 'event-created',
              createdAt: new Date(),
            }),
          },
        }),
      ),
    } as any;
  }

  it('accepte un but d’un titulaire pendant la première mi-temps', async () => {
    const prisma = makeIntegrityPrisma([
      event(LiveMatchEventType.MATCH_START),
    ]);

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.GOAL,
        clubId: 'home-club',
        registrationId: 'starter1',
        minute: 20,
        period: MatchEventPeriod.FIRST_HALF,
      }),
    ).resolves.toBeDefined();
  });

  it('refuse un but pendant la mi-temps', async () => {
    const prisma = makeIntegrityPrisma([
      event(LiveMatchEventType.MATCH_START),
      event(LiveMatchEventType.HALF_TIME),
    ]);

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.GOAL,
        clubId: 'home-club',
        registrationId: 'starter1',
        minute: 45,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse un but d’un remplaçant qui n’est jamais entré', async () => {
    const prisma = makeIntegrityPrisma([
      event(LiveMatchEventType.MATCH_START),
    ]);

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.GOAL,
        clubId: 'home-club',
        registrationId: 'sub1',
        minute: 30,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepte le but d’un remplaçant après son entrée', async () => {
    const prisma = makeIntegrityPrisma([
      event(LiveMatchEventType.MATCH_START),
      event(LiveMatchEventType.SUBSTITUTION, {
        clubId: 'home-club',
        registrationId: 'starter1',
        secondaryRegistrationId: 'sub1',
      }),
    ]);

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.GOAL,
        clubId: 'home-club',
        registrationId: 'sub1',
        minute: 35,
      }),
    ).resolves.toBeDefined();
  });

  it('refuse le but d’un joueur déjà remplacé', async () => {
    const prisma = makeIntegrityPrisma([
      event(LiveMatchEventType.MATCH_START),
      event(LiveMatchEventType.SUBSTITUTION, {
        clubId: 'home-club',
        registrationId: 'starter1',
        secondaryRegistrationId: 'sub1',
      }),
    ]);

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.GOAL,
        clubId: 'home-club',
        registrationId: 'starter1',
        minute: 35,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse le but d’un joueur expulsé', async () => {
    const prisma = makeIntegrityPrisma([
      event(LiveMatchEventType.MATCH_START),
      event(LiveMatchEventType.RED_CARD, {
        clubId: 'home-club',
        registrationId: 'starter1',
      }),
    ]);

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.GOAL,
        clubId: 'home-club',
        registrationId: 'starter1',
        minute: 40,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepte un but pendant la deuxième mi-temps', async () => {
    const prisma = makeIntegrityPrisma([
      event(LiveMatchEventType.MATCH_START),
      event(LiveMatchEventType.HALF_TIME),
      event(LiveMatchEventType.SECOND_HALF_START),
    ]);

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.GOAL,
        clubId: 'home-club',
        registrationId: 'starter1',
        minute: 70,
        period: MatchEventPeriod.SECOND_HALF,
      }),
    ).resolves.toBeDefined();
  });

  it('refuse une période incohérente avec la phase réelle', async () => {
    const prisma = makeIntegrityPrisma([
      event(LiveMatchEventType.MATCH_START),
      event(LiveMatchEventType.HALF_TIME),
      event(LiveMatchEventType.SECOND_HALF_START),
    ]);

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.GOAL,
        clubId: 'home-club',
        registrationId: 'starter1',
        minute: 70,
        period: MatchEventPeriod.FIRST_HALF,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('conserve les remplacements possibles pendant la mi-temps', async () => {
    const prisma = makeIntegrityPrisma([
      event(LiveMatchEventType.MATCH_START),
      event(LiveMatchEventType.HALF_TIME),
    ]);

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.SUBSTITUTION,
        clubId: 'home-club',
        registrationId: 'starter1',
        secondaryRegistrationId: 'sub1',
        minute: 45,
      }),
    ).resolves.toBeDefined();
  });

  it('conserve les cartons possibles pendant la mi-temps', async () => {
    const prisma = makeIntegrityPrisma([
      event(LiveMatchEventType.MATCH_START),
      event(LiveMatchEventType.HALF_TIME),
    ]);

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.YELLOW_CARD,
        clubId: 'home-club',
        registrationId: 'sub1',
        minute: 45,
      }),
    ).resolves.toBeDefined();
  });
});

describe('MatchEventsService - advanced match facts', () => {
  const actor = {
    userId: 'league-admin',
    memberships: [
      {
        role: Role.LIGUE_ADMIN,
        organizationId: 'league-org',
      },
    ],
  } as any;

  function makeFactsPrisma() {
    const match = {
      id: 'match-1',
      status: MatchStatus.IN_PROGRESS,
      homeScore: 0,
      awayScore: 0,
      homeClubId: 'home-club',
      awayClubId: 'away-club',
      competition: { organizationId: 'league-org' },
      matchSheet: { status: MatchSheetStatus.LOCKED },
      officialAssignments: [],
    };

    return {
      match: {
        findUnique: jest.fn().mockResolvedValue(match),
      },
      officialProfile: {
        findUnique: jest.fn(),
      },
      matchSheet: {
        findUnique: jest.fn().mockResolvedValue({
          status: MatchSheetStatus.LOCKED,
          players: [{ id: 'sheet-starter1' }],
        }),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation(async (callback: any) =>
        callback({
          match: {
            update: jest.fn().mockImplementation(({ data }: any) =>
              Promise.resolve({ ...match, ...data }),
            ),
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({
              id: 'fact-event',
              createdAt: new Date(),
            }),
          },
        }),
      ),
    } as any;
  }

  it('accepte une blessure documentée pour un joueur de la feuille', async () => {
    const service = new MatchEventsService(makeFactsPrisma(), {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.INJURY,
        clubId: 'home-club',
        registrationId: 'starter1',
        minute: 32,
        description: 'Douleur à la cheville droite',
      }),
    ).resolves.toBeDefined();
  });

  it('refuse une blessure sans joueur', async () => {
    const service = new MatchEventsService(makeFactsPrisma(), {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.INJURY,
        clubId: 'home-club',
        minute: 32,
        description: 'Blessure',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse une blessure sans description', async () => {
    const service = new MatchEventsService(makeFactsPrisma(), {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.INJURY,
        clubId: 'home-club',
        registrationId: 'starter1',
        minute: 32,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepte un incident documenté sans joueur', async () => {
    const service = new MatchEventsService(makeFactsPrisma(), {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.INCIDENT,
        minute: 55,
        description: 'Interruption après jets de projectiles',
      }),
    ).resolves.toBeDefined();
  });

  it('refuse un incident sans description', async () => {
    const service = new MatchEventsService(makeFactsPrisma(), {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.INCIDENT,
        minute: 55,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepte une observation officielle documentée', async () => {
    const service = new MatchEventsService(makeFactsPrisma(), {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.OBSERVATION,
        minute: 90,
        description: 'Éclairage insuffisant pendant plusieurs minutes',
      }),
    ).resolves.toBeDefined();
  });

  it('refuse une observation vide', async () => {
    const service = new MatchEventsService(makeFactsPrisma(), {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.create(actor, 'match-1', {
        type: LiveMatchEventType.OBSERVATION,
        minute: 90,
        description: '   ',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('MatchEventsService - post-match entries', () => {
  const actor = {
    userId: 'league-admin',
    memberships: [
      {
        role: Role.LIGUE_ADMIN,
        organizationId: 'league-org',
      },
    ],
  } as any;

  function makePostMatchPrisma(
    status: MatchStatus = MatchStatus.COMPLETED,
  ) {
    const match = {
      id: 'match-1',
      status,
      homeClubId: 'club-home',
      awayClubId: 'club-away',
      homeScore: 1,
      awayScore: 0,
      competition: {
        organizationId: 'league-org',
      },
      homeClub: {
        organizationId: 'home-org',
      },
      awayClub: {
        organizationId: 'away-org',
      },
      officialAssignments: [],
    };

    return {
      match: {
        findUnique: jest.fn().mockResolvedValue(match),
      },
      matchSheet: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sheet-1',
        }),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: 'post-match-1',
            action: data.action,
            metadata: data.metadata,
            createdAt: new Date(
              '2026-09-16T16:00:00.000Z',
            ),
          }),
        ),
      },
      officialProfile: {
        findUnique: jest.fn(),
      },
    } as any;
  }

  it('accepte une réserve technique après la fin du match', async () => {
    const prisma = makePostMatchPrisma();
    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.createPostMatchEntry(actor, 'match-1', {
        type: 'TECHNICAL_RESERVE' as any,
        clubId: 'club-home',
        description:
          'Réserve concernant une décision technique.',
      }),
    ).resolves.toMatchObject({
      type: 'TECHNICAL_RESERVE',
      clubId: 'club-home',
    });
  });

  it('refuse une réserve technique à un arbitre assistant', async () => {
    const prisma = makePostMatchPrisma();

    prisma.match.findUnique.mockResolvedValue({
      id: 'match-1',
      status: MatchStatus.COMPLETED,
      homeClubId: 'club-home',
      awayClubId: 'club-away',
      homeScore: 1,
      awayScore: 0,
      competition: {
        organizationId: 'league-org',
      },
      homeClub: {
        organizationId: 'home-org',
      },
      awayClub: {
        organizationId: 'away-org',
      },
      officialAssignments: [
        {
          officialProfileId: 'official-registration',
          role: MatchOfficialRole.ASSISTANT_REFEREE_1,
        },
      ],
    });

    prisma.officialProfile.findUnique.mockResolvedValue({
      registrationId: 'official-registration',
    });

    const officialActor = {
      userId: 'official-user',
      memberships: [
        {
          role: Role.OFFICIEL,
          organizationId: 'league-org',
        },
      ],
    } as any;

    const service = new MatchEventsService(prisma, {
      createSuspension: jest.fn(),
      createYellowCardSuspensionIfThresholdReached: jest.fn(),
      serveSuspensionsForCompletedMatch: jest.fn(),
    } as any);

    await expect(
      service.createPostMatchEntry(officialActor, 'match-1', {
        type: 'TECHNICAL_RESERVE' as any,
        clubId: 'club-home',
        description: 'Réserve technique.',
      }),
    ).rejects.toThrow(
      'Le rôle ASSISTANT_REFEREE_1 n’est pas autorisé à enregistrer la saisie post-match TECHNICAL_RESERVE',
    );
  });

  it('autorise une observation post-match à un arbitre assistant', async () => {
    const prisma = makePostMatchPrisma();

    prisma.match.findUnique.mockResolvedValue({
      id: 'match-1',
      status: MatchStatus.COMPLETED,
      homeClubId: 'club-home',
      awayClubId: 'club-away',
      homeScore: 1,
      awayScore: 0,
      competition: {
        organizationId: 'league-org',
      },
      homeClub: {
        organizationId: 'home-org',
      },
      awayClub: {
        organizationId: 'away-org',
      },
      officialAssignments: [
        {
          officialProfileId: 'official-registration',
          role: MatchOfficialRole.ASSISTANT_REFEREE_1,
        },
      ],
    });

    prisma.officialProfile.findUnique.mockResolvedValue({
      registrationId: 'official-registration',
    });

    const officialActor = {
      userId: 'official-user',
      memberships: [
        {
          role: Role.OFFICIEL,
          organizationId: 'league-org',
        },
      ],
    } as any;

    const service = new MatchEventsService(prisma, {
      createSuspension: jest.fn(),
      createYellowCardSuspensionIfThresholdReached: jest.fn(),
      serveSuspensionsForCompletedMatch: jest.fn(),
    } as any);

    await expect(
      service.createPostMatchEntry(officialActor, 'match-1', {
        type: 'POST_MATCH_OBSERVATION' as any,
        description: 'Observation de l’assistant.',
      }),
    ).resolves.toMatchObject({
      type: 'POST_MATCH_OBSERVATION',
    });
  });

  it('refuse une saisie post-match avant la fin du match', async () => {
    const prisma = makePostMatchPrisma(
      MatchStatus.IN_PROGRESS,
    );
    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.createPostMatchEntry(actor, 'match-1', {
        type: 'POST_MATCH_OBSERVATION' as any,
        description: 'Observation après-match.',
      }),
    ).rejects.toThrow(
      'Le match doit être terminé avant la saisie post-match',
    );
  });

  it('refuse une réserve technique sans club', async () => {
    const prisma = makePostMatchPrisma();
    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.createPostMatchEntry(actor, 'match-1', {
        type: 'TECHNICAL_RESERVE' as any,
        description: 'Réserve sans club.',
      }),
    ).rejects.toThrow(
      'Un club est obligatoire pour une réserve technique',
    );
  });

  it('refuse une modification après une première signature', async () => {
    const prisma = makePostMatchPrisma();

    prisma.auditLog.findFirst
      .mockResolvedValueOnce({
        id: 'signature-1',
      });

    const service = new MatchEventsService(prisma, {
  createSuspension: jest.fn(),
  createYellowCardSuspensionIfThresholdReached: jest.fn(),
  serveSuspensionsForCompletedMatch: jest.fn(),
} as any);

    await expect(
      service.createPostMatchEntry(actor, 'match-1', {
        type: 'POST_MATCH_OBSERVATION' as any,
        description: 'Tentative tardive.',
      }),
    ).rejects.toThrow(
      'Le contenu post-match est figé dès la première signature',
    );
  });
});
