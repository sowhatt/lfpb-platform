import {
  LicenseStatus,
  MatchSheetPlayerRole,
  RegistrationStatus,
  Role,
} from '@prisma/client';
import { MatchSheetsService } from './match-sheets.service';

describe('MatchSheetsService', () => {
  const prisma = {
    match: { findUnique: jest.fn() },
    registration: { findMany: jest.fn() },
    matchSheet: { findUnique: jest.fn(), upsert: jest.fn() },
    matchSheetPlayer: { upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  } as any;

  const service = new MatchSheetsService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.match.findUnique.mockResolvedValue({
      id: 'match',
      homeClubId: 'home-club',
      awayClubId: 'away-club',
      kickoffAt: new Date('2026-10-10T16:00:00.000Z'),
      competition: { season: { name: '2026-2027' } },
      homeClub: {
        id: 'home-club',
        organizationId: 'home-org',
        organization: { name: 'Club domicile' },
      },
      awayClub: {
        id: 'away-club',
        organizationId: 'away-org',
        organization: { name: 'Club visiteur' },
      },
    });
  });

  it('marks an issued and date-valid FBF licence as eligible', async () => {
    prisma.registration.findMany.mockResolvedValue([eligibleRegistration()]);

    const result = await service.eligiblePlayers(
      clubActor(),
      'match',
      'home-club',
    );

    expect(result.players[0].eligible).toBe(true);
    expect(result.players[0].reasons).toEqual([]);
  });

  it('marks a rejected FBF licence as ineligible', async () => {
    prisma.registration.findMany.mockResolvedValue([
      {
        ...eligibleRegistration(),
        licenses: [
          {
            id: 'license',
            number: null,
            status: LicenseStatus.REJECTED_BY_FBF,
            validFrom: null,
            validUntil: null,
          },
        ],
      },
    ]);

    const result = await service.eligiblePlayers(
      clubActor(),
      'match',
      'home-club',
    );

    expect(result.players[0].eligible).toBe(false);
    expect(result.players[0].reasons.join(' ')).toContain('Licence non délivrée par la FBF');
  });

  it('persists an eligible starter on the home match sheet', async () => {
    prisma.registration.findMany.mockResolvedValue([eligibleRegistration()]);
    prisma.matchSheet.upsert.mockResolvedValue({ id: 'sheet', matchId: 'match' });
    prisma.matchSheetPlayer.upsert.mockResolvedValue({
      id: 'sheet-player',
      registrationId: 'registration',
      role: MatchSheetPlayerRole.STARTER,
    });
    prisma.auditLog.create.mockResolvedValue({ id: 'audit' });

    const result = await service.addPlayer(clubActor(), 'match', {
      clubId: 'home-club',
      registrationId: 'registration',
      role: MatchSheetPlayerRole.STARTER,
      shirtNumber: 4,
    });

    expect(result.id).toBe('sheet-player');
    expect(prisma.matchSheet.upsert).toHaveBeenCalledWith({
      where: { matchId: 'match' },
      update: {},
      create: { matchId: 'match' },
    });
    expect(prisma.matchSheetPlayer.upsert).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('refuses to persist a player rejected by the FBF', async () => {
    prisma.registration.findMany.mockResolvedValue([
      {
        ...eligibleRegistration(),
        licenses: [
          {
            id: 'license',
            number: null,
            status: LicenseStatus.REJECTED_BY_FBF,
            validFrom: null,
            validUntil: null,
          },
        ],
      },
    ]);

    await expect(
      service.addPlayer(clubActor(), 'match', {
        clubId: 'home-club',
        registrationId: 'registration',
        role: MatchSheetPlayerRole.SUBSTITUTE,
        shirtNumber: 14,
      }),
    ).rejects.toThrow('Joueur non éligible');

    expect(prisma.matchSheet.upsert).not.toHaveBeenCalled();
    expect(prisma.matchSheetPlayer.upsert).not.toHaveBeenCalled();
  });

  function clubActor() {
    return {
      userId: 'user',
      memberships: [{ organizationId: 'home-org', role: Role.CLUB_ADMIN }],
    };
  }

  function eligibleRegistration() {
    return {
      id: 'registration',
      status: RegistrationStatus.VALIDATED,
      person: { firstName: 'Test', lastName: 'Player', federationId: 'FED-1' },
      playerProfile: { position: 'DEFENDER', shirtNumber: 4 },
      licenses: [
        {
          id: 'license',
          number: 'FBF-TEST-1',
          status: LicenseStatus.ISSUED_BY_FBF,
          validFrom: new Date('2026-09-01T00:00:00.000Z'),
          validUntil: new Date('2027-06-30T00:00:00.000Z'),
        },
      ],
    };
  }
});
