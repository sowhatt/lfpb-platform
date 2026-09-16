import { BadRequestException } from '@nestjs/common';
import {
  MatchSheetPlayerRole,
  MatchSheetStatus,
  MatchStatus,
  Role,
} from '@prisma/client';
import { MatchEventsService } from './match-events.service';
import { LiveMatchEventType } from './dto/create-match-event.dto';

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
    competition: { organizationId: 'league-org' },
    matchSheet: { status: MatchSheetStatus.LOCKED },
    officialAssignments: [
      {
        officialProfileId: 'official-registration',
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

    const service = new MatchEventsService(prisma);

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

    const service = new MatchEventsService(prisma);

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

    const service = new MatchEventsService(prisma);

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
    const service = new MatchEventsService(prisma);

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

    const service = new MatchEventsService(prisma);

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

    const service = new MatchEventsService(prisma);

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

    const service = new MatchEventsService(prisma);

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

    const service = new MatchEventsService(prisma);

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
