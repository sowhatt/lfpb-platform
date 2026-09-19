import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  MatchHomologationStatus,
  MatchSheetStatus,
  MatchStatus,
  Role,
} from '@prisma/client';
import { CompetitionsService } from './competitions.service';

describe('CompetitionsService - homologation', () => {
  const actor = {
    userId: 'league-user',
    memberships: [
      {
        organizationId: 'league-org',
        role: Role.LIGUE_ADMIN,
      },
    ],
  };

  const baseMatch = {
    id: 'match-1',
    competitionId: 'competition-1',
    homeClubId: 'home-club',
    awayClubId: 'away-club',
    status: MatchStatus.COMPLETED,
    homeScore: 2,
    awayScore: 1,
    homologationStatus: MatchHomologationStatus.PENDING,
    competition: {
      id: 'competition-1',
      organizationId: 'league-org',
    },
    matchSheet: {
      id: 'sheet-1',
      status: MatchSheetStatus.LOCKED,
    },
  };

  let prisma: any;
  let tenantAccess: any;
  let service: CompetitionsService;

  beforeEach(() => {
    prisma = {
      match: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      auditLog: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };

    tenantAccess = {
      assertOrganizationAccess: jest.fn(),
    };

    service = new CompetitionsService(
      prisma,
      tenantAccess,
      {} as any,
      {} as any,
    );

    prisma.match.findUnique
      .mockResolvedValueOnce({
        ...baseMatch,
        competition: { ...baseMatch.competition },
        matchSheet: { ...baseMatch.matchSheet },
      })
      .mockImplementation(() =>
        Promise.resolve({
          ...baseMatch,
          homologationStatus: MatchHomologationStatus.HOMOLOGATED,
          officialHomeScore: 2,
          officialAwayScore: 1,
          homologatedByUserId: actor.userId,
        }),
      );

    prisma.auditLog.findFirst.mockResolvedValue({
      id: 'closure-1',
      action: 'MATCH_OFFICIALLY_CLOSED',
    });

    prisma.match.updateMany.mockResolvedValue({ count: 1 });

    prisma.auditLog.create.mockResolvedValue({
      id: 'audit-1',
    });
  });

  it('homologue le score terrain sans modification', async () => {
    const result = await service.homologateMatch(actor, 'match-1', {
      officialHomeScore: 2,
      officialAwayScore: 1,
    });

    expect(result.homologationStatus).toBe(
      MatchHomologationStatus.HOMOLOGATED,
    );
    expect(result.officialHomeScore).toBe(2);
    expect(result.officialAwayScore).toBe(1);

    expect(prisma.match.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'match-1',
          homologationStatus: MatchHomologationStatus.PENDING,
        },
        data: expect.objectContaining({
          homologationStatus: MatchHomologationStatus.HOMOLOGATED,
          officialHomeScore: 2,
          officialAwayScore: 1,
          homologatedByUserId: 'league-user',
        }),
      }),
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'MATCH_HOMOLOGATED',
          resourceType: 'Match',
          resourceId: 'match-1',
        }),
      }),
    );
  });

  it('accepte une correction administrative du score avec motif', async () => {
    await service.homologateMatch(actor, 'match-1', {
      officialHomeScore: 0,
      officialAwayScore: 3,
      reason: 'Décision administrative',
    });

    expect(prisma.match.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          officialHomeScore: 0,
          officialAwayScore: 3,
          homologationReason: 'Décision administrative',
          homologationStatus: MatchHomologationStatus.HOMOLOGATED,
        }),
      }),
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            terrainHomeScore: 2,
            terrainAwayScore: 1,
            officialHomeScore: 0,
            officialAwayScore: 3,
            scoreChanged: true,
            reason: 'Décision administrative',
          }),
        }),
      }),
    );
  });

  it('refuse une correction du score sans motif', async () => {
    await expect(
      service.homologateMatch(actor, 'match-1', {
        officialHomeScore: 0,
        officialAwayScore: 3,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.match.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('refuse un match sans clôture officielle', async () => {
    prisma.auditLog.findFirst.mockResolvedValue(null);

    await expect(
      service.homologateMatch(actor, 'match-1', {
        officialHomeScore: 2,
        officialAwayScore: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.match.updateMany).not.toHaveBeenCalled();
  });

  it('refuse une deuxième homologation', async () => {
    prisma.match.findUnique.mockReset();
    prisma.match.findUnique.mockResolvedValue({
      ...baseMatch,
      homologationStatus: MatchHomologationStatus.HOMOLOGATED,
      competition: { ...baseMatch.competition },
      matchSheet: { ...baseMatch.matchSheet },
    });

    await expect(
      service.homologateMatch(actor, 'match-1', {
        officialHomeScore: 2,
        officialAwayScore: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.match.updateMany).not.toHaveBeenCalled();
  });

  it('refuse une transition concurrente si le match a déjà quitté PENDING', async () => {
    prisma.match.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.homologateMatch(actor, 'match-1', {
        officialHomeScore: 2,
        officialAwayScore: 1,
      }),
    ).rejects.toThrow(
      'Le match a déjà été homologué ou son statut a changé',
    );

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('refuse un acteur qui n’est pas administrateur Ligue', async () => {
    const officialActor = {
      userId: 'official-user',
      memberships: [
        {
          organizationId: 'league-org',
          role: Role.OFFICIEL,
        },
      ],
    };

    await expect(
      service.homologateMatch(officialActor, 'match-1', {
        officialHomeScore: 2,
        officialAwayScore: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.match.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
