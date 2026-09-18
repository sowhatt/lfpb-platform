import { DisciplineService } from './discipline.service';

describe('DisciplineService', () => {
  function makePrisma(
    cardLogs: any[] = [],
    sanctionLogs: any[] = [],
  ) {
    return {
      match: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'match-1' },
          { id: 'match-2' },
        ]),
      },
      auditLog: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(cardLogs)
          .mockResolvedValueOnce(sanctionLogs),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'audit-new',
          createdAt: new Date('2026-09-18T00:00:00.000Z'),
          ...data,
        })),
      },
    } as any;
  }

  it('compte les cartons du joueur dans la compétition', async () => {
    const prisma = makePrisma([
      {
        id: '1',
        action: 'MATCH_EVENT_YELLOW_CARD',
        metadata: { registrationId: 'player-1' },
      },
      {
        id: '2',
        action: 'MATCH_EVENT_YELLOW_CARD',
        metadata: { registrationId: 'player-1' },
      },
      {
        id: '3',
        action: 'MATCH_EVENT_RED_CARD',
        metadata: { registrationId: 'player-1' },
      },
      {
        id: '4',
        action: 'MATCH_EVENT_YELLOW_CARD',
        metadata: { registrationId: 'other-player' },
      },
    ]);

    const service = new DisciplineService(prisma);

    const state = await service.getPlayerDisciplineState(
      'competition-1',
      'player-1',
    );

    expect(state.yellowCards).toBe(2);
    expect(state.redCards).toBe(1);
    expect(state.activeSuspension).toBeNull();
  });

  it('calcule une suspension active', async () => {
    const prisma = makePrisma([], [
      {
        id: 's1',
        action: 'DISCIPLINARY_SANCTION_CREATED',
        createdAt: new Date('2026-09-10T10:00:00.000Z'),
        metadata: {
          competitionId: 'competition-1',
          matchesTotal: 2,
          reason: 'Carton rouge direct',
        },
      },
      {
        id: 's2',
        action: 'DISCIPLINARY_SANCTION_MATCH_SERVED',
        createdAt: new Date('2026-09-12T10:00:00.000Z'),
        metadata: {
          competitionId: 'competition-1',
        },
      },
    ]);

    const service = new DisciplineService(prisma);

    const state = await service.getPlayerDisciplineState(
      'competition-1',
      'player-1',
    );

    expect(state.activeSuspension).toEqual(
      expect.objectContaining({
        matchesTotal: 2,
        matchesServed: 1,
        matchesRemaining: 1,
        reason: 'Carton rouge direct',
      }),
    );
  });

  it('termine la suspension lorsque tous les matchs sont purgés', async () => {
    const prisma = makePrisma([], [
      {
        action: 'DISCIPLINARY_SANCTION_CREATED',
        createdAt: new Date(),
        metadata: {
          competitionId: 'competition-1',
          matchesTotal: 1,
          reason: 'Suspension',
        },
      },
      {
        action: 'DISCIPLINARY_SANCTION_MATCH_SERVED',
        createdAt: new Date(),
        metadata: {
          competitionId: 'competition-1',
        },
      },
    ]);

    const service = new DisciplineService(prisma);

    const state = await service.getPlayerDisciplineState(
      'competition-1',
      'player-1',
    );

    expect(state.activeSuspension).toBeNull();
  });

  it('annule une suspension', async () => {
    const prisma = makePrisma([], [
      {
        action: 'DISCIPLINARY_SANCTION_CREATED',
        createdAt: new Date(),
        metadata: {
          competitionId: 'competition-1',
          matchesTotal: 2,
          reason: 'Suspension',
        },
      },
      {
        action: 'DISCIPLINARY_SANCTION_CANCELLED',
        createdAt: new Date(),
        metadata: {
          competitionId: 'competition-1',
        },
      },
    ]);

    const service = new DisciplineService(prisma);

    const state = await service.getPlayerDisciplineState(
      'competition-1',
      'player-1',
    );

    expect(state.activeSuspension).toBeNull();
  });

  it('crée une sanction traçable', async () => {
    const prisma = makePrisma();
    const service = new DisciplineService(prisma);

    await service.createSuspension({
      actorUserId: 'user-1',
      organizationId: 'league-1',
      competitionId: 'competition-1',
      registrationId: 'player-1',
      matchesTotal: 2,
      reason: 'Carton rouge direct',
      source: 'RED_CARD',
      sourceMatchId: 'match-1',
      sourceEventId: 'event-1',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'user-1',
        organizationId: 'league-1',
        action: 'DISCIPLINARY_SANCTION_CREATED',
        resourceType: 'DisciplinarySanction',
        resourceId: 'player-1',
        metadata: expect.objectContaining({
          competitionId: 'competition-1',
          matchesTotal: 2,
          reason: 'Carton rouge direct',
          source: 'RED_CARD',
          sourceMatchId: 'match-1',
          sourceEventId: 'event-1',
        }),
      }),
    });
  });
});

describe('DisciplineService - purge automatique', () => {
  it('ne purge pas deux fois le même match', async () => {
    const prisma = {
      match: {
        findMany: jest.fn().mockResolvedValue([{ id: 'match-1' }]),
      },
      auditLog: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              action: 'DISCIPLINARY_SANCTION_CREATED',
              createdAt: new Date(),
              metadata: {
                competitionId: 'competition-1',
                matchesTotal: 2,
                reason: 'Suspension',
              },
            },
          ])
          .mockResolvedValueOnce([
            {
              action: 'DISCIPLINARY_SANCTION_MATCH_SERVED',
              createdAt: new Date(),
              metadata: {
                competitionId: 'competition-1',
                matchId: 'match-2',
              },
            },
          ]),
        create: jest.fn(),
      },
    } as any;

    const service = new DisciplineService(prisma);

    const result = await service.serveSuspensionMatch({
      organizationId: 'league-1',
      competitionId: 'competition-1',
      registrationId: 'player-1',
      matchId: 'match-2',
    });

    expect(result).toBeNull();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('purge un joueur suspendu absent de la feuille', async () => {
    const prisma = {
      matchSheet: {
        findUnique: jest.fn().mockResolvedValue({
          players: [{ registrationId: 'player-on-sheet' }],
        }),
      },
      registration: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'player-suspended' },
          { id: 'player-on-sheet' },
        ]),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([{ id: 'match-1' }]),
      },
      auditLog: {
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          if (
            where.resourceType === 'MatchEvent'
          ) {
            return Promise.resolve([]);
          }

          if (
            where.resourceType === 'DisciplinarySanction' &&
            where.action?.in
          ) {
            return Promise.resolve([
              {
                action: 'DISCIPLINARY_SANCTION_CREATED',
                createdAt: new Date(),
                metadata: {
                  competitionId: 'competition-1',
                  matchesTotal: 1,
                  reason: 'Carton rouge',
                },
              },
            ]);
          }

          return Promise.resolve([]);
        }),
        create: jest.fn().mockResolvedValue({
          id: 'served-1',
          createdAt: new Date(),
        }),
      },
    } as any;

    const service = new DisciplineService(prisma);

    const result = await service.serveSuspensionsForCompletedMatch({
      organizationId: 'league-1',
      competitionId: 'competition-1',
      matchId: 'match-1',
      homeOrganizationId: 'club-home',
      awayOrganizationId: 'club-away',
    });

    expect(result.servedRegistrationIds).toContain('player-suspended');
    expect(result.servedRegistrationIds).not.toContain('player-on-sheet');
    expect(result.count).toBe(1);
  });
});
