import { BadRequestException } from '@nestjs/common';
import {
  MatchSheetStatus,
  MatchStatus,
  Role,
} from '@prisma/client';
import { MatchSheetSignaturesService } from './match-sheet-signatures.service';
import { MatchSheetSignatureRole } from './dto/sign-match-sheet.dto';

describe('MatchSheetSignaturesService - report certification', () => {
  const actor = {
    userId: 'user-home',
    email: 'home@example.test',
    memberships: [
      {
        organizationId: 'org-home',
        role: Role.CLUB_ADMIN,
      },
    ],
  } as any;

  function createPrisma(options?: {
    status?: MatchStatus;
    existing?: any[];
    events?: any[];
  }) {
    const sheet = {
      id: 'sheet-1',
      matchId: 'match-1',
      status: MatchSheetStatus.LOCKED,
      lockedAt: new Date('2026-09-16T12:00:00.000Z'),
      players: [
        {
          registrationId: 'player-1',
          clubId: 'club-home',
          side: 'HOME',
          role: 'STARTER',
          shirtNumber: 9,
        },
      ],
      match: {
        id: 'match-1',
        status: options?.status ?? MatchStatus.COMPLETED,
        homeClubId: 'club-home',
        awayClubId: 'club-away',
        homeScore: 1,
        awayScore: 0,
        homeClub: {
          organizationId: 'org-home',
          shortName: 'HOME',
        },
        awayClub: {
          organizationId: 'org-away',
          shortName: 'AWAY',
        },
        competition: {
          organizationId: 'org-league',
        },
      },
    };

    const existing = options?.existing ?? [];
    const events =
      options?.events ??
      [
        {
          id: 'event-1',
          action: 'MATCH_EVENT_GOAL',
          createdAt: new Date('2026-09-16T13:10:00.000Z'),
          metadata: {
            registrationId: 'player-1',
            minute: 10,
          },
        },
      ];

    return {
      matchSheet: {
        findUnique: jest.fn().mockResolvedValue(sheet),
      },
      auditLog: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }: any) => {
            if (where.resourceType === 'MatchEvent') {
              return Promise.resolve(events);
            }
            return Promise.resolve(existing);
          }),
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: 'signature-1',
            metadata: data.metadata,
          }),
        ),
      },
      officialProfile: {
        findUnique: jest.fn(),
      },
      matchOfficialAssignment: {
        findFirst: jest.fn(),
      },
    } as any;
  }

  it('refuse une signature avant la fin du match', async () => {
    const prisma = createPrisma({
      status: MatchStatus.IN_PROGRESS,
    });

    const service = new MatchSheetSignaturesService(prisma);

    await expect(
      service.sign(actor, 'match-1', {
        role: MatchSheetSignatureRole.HOME_REPRESENTATIVE,
        signerName: 'Président Home',
      }),
    ).rejects.toThrow(
      'Le match doit être terminé avant la signature du rapport officiel',
    );
  });

  it('certifie le rapport complet avec une empreinte v2', async () => {
    const prisma = createPrisma();
    const service = new MatchSheetSignaturesService(prisma);

    const result = await service.sign(actor, 'match-1', {
      role: MatchSheetSignatureRole.HOME_REPRESENTATIVE,
      signerName: 'Président Home',
    });

    expect(result.reportFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.sheetFingerprint).toBe(result.reportFingerprint);
    expect(result.fingerprintVersion).toBe(2);
  });

  it('produit une empreinte différente si les faits du match changent', async () => {
    const prismaA = createPrisma();
    const serviceA = new MatchSheetSignaturesService(prismaA);

    const first = await serviceA.sign(actor, 'match-1', {
      role: MatchSheetSignatureRole.HOME_REPRESENTATIVE,
      signerName: 'Président Home',
    });

    const prismaB = createPrisma({
      events: [
        {
          id: 'event-1',
          action: 'MATCH_EVENT_GOAL',
          createdAt: new Date('2026-09-16T13:10:00.000Z'),
          metadata: {
            registrationId: 'player-1',
            minute: 11,
          },
        },
      ],
    });

    const serviceB = new MatchSheetSignaturesService(prismaB);

    const second = await serviceB.sign(actor, 'match-1', {
      role: MatchSheetSignatureRole.HOME_REPRESENTATIVE,
      signerName: 'Président Home',
    });

    expect(second.reportFingerprint).not.toBe(first.reportFingerprint);
  });

  it('refuse de poursuivre si le rapport a changé après une première signature', async () => {
    const prismaInitial = createPrisma();
    const initialService = new MatchSheetSignaturesService(prismaInitial);

    const first = await initialService.sign(actor, 'match-1', {
      role: MatchSheetSignatureRole.HOME_REPRESENTATIVE,
      signerName: 'Président Home',
    });

    const awayActor = {
      userId: 'user-away',
      email: 'away@example.test',
      memberships: [
        {
          organizationId: 'org-away',
          role: Role.CLUB_ADMIN,
        },
      ],
    } as any;

    const prismaChanged = createPrisma({
      existing: [
        {
          id: 'signature-home',
          metadata: {
            role: MatchSheetSignatureRole.HOME_REPRESENTATIVE,
            reportFingerprint: first.reportFingerprint,
          },
        },
      ],
      events: [
        {
          id: 'event-1',
          action: 'MATCH_EVENT_GOAL',
          createdAt: new Date('2026-09-16T13:10:00.000Z'),
          metadata: {
            registrationId: 'player-1',
            minute: 12,
          },
        },
      ],
    });

    const changedService = new MatchSheetSignaturesService(
      prismaChanged,
    );

    await expect(
      changedService.sign(awayActor, 'match-1', {
        role: MatchSheetSignatureRole.AWAY_REPRESENTATIVE,
        signerName: 'Président Away',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
