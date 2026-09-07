import {
  LicenseStatus,
  MatchSheetPlayerRole,
  MatchSheetSide,
  MatchSheetStatus,
  RegistrationStatus,
  Role,
} from '@prisma/client';
import { MatchSheetsService } from './match-sheets.service';

describe('MatchSheetsService', () => {
  const prisma = {
    match: { findUnique: jest.fn() },
    registration: { findMany: jest.fn() },
    matchSheet: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
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
    prisma.matchSheet.findUnique.mockResolvedValue(null);
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

  it('submits the home composition while keeping the sheet in draft', async () => {
    prisma.registration.findMany.mockResolvedValue([eligibleRegistration()]);
    prisma.matchSheet.findUnique.mockResolvedValue({
      id: 'sheet',
      status: MatchSheetStatus.DRAFT,
      homeSubmittedAt: null,
      awaySubmittedAt: null,
      players: [{ id: 'home-player' }],
    });
    prisma.matchSheet.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'sheet', ...data, players: [] }),
    );
    prisma.auditLog.create.mockResolvedValue({ id: 'audit' });

    const result = await service.submitSide(clubActor(), 'match', 'home-club');

    expect(result.status).toBe(MatchSheetStatus.DRAFT);
    expect(result.homeSubmittedAt).toBeInstanceOf(Date);
    expect(result.awaySubmittedAt).toBeNull();
    expect(prisma.matchSheet.update).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'MATCH_SHEET_SIDE_SUBMITTED' }),
      }),
    );
  });

  it('moves the sheet to submitted when the away composition is the second submission', async () => {
    prisma.registration.findMany.mockResolvedValue([eligibleRegistration()]);
    const homeSubmittedAt = new Date('2026-10-10T14:00:00.000Z');
    prisma.matchSheet.findUnique.mockResolvedValue({
      id: 'sheet',
      status: MatchSheetStatus.DRAFT,
      homeSubmittedAt,
      awaySubmittedAt: null,
      players: [{ id: 'away-player' }],
    });
    prisma.matchSheet.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'sheet', ...data, players: [] }),
    );
    prisma.auditLog.create.mockResolvedValue({ id: 'audit' });

    const result = await service.submitSide(leagueActor(), 'match', 'away-club');

    expect(result.status).toBe(MatchSheetStatus.SUBMITTED);
    expect(result.homeSubmittedAt).toEqual(homeSubmittedAt);
    expect(result.awaySubmittedAt).toBeInstanceOf(Date);
  });

  it('refuses changes to a composition after that side has submitted', async () => {
    prisma.registration.findMany.mockResolvedValue([eligibleRegistration()]);
    prisma.matchSheet.findUnique.mockResolvedValue({
      id: 'sheet',
      status: MatchSheetStatus.DRAFT,
      homeSubmittedAt: new Date(),
      awaySubmittedAt: null,
    });

    await expect(
      service.addPlayer(clubActor(), 'match', {
        clubId: 'home-club',
        registrationId: 'registration',
        role: MatchSheetPlayerRole.STARTER,
        shirtNumber: 4,
      }),
    ).rejects.toThrow('La composition domicile a déjà été soumise');

    expect(prisma.matchSheetPlayer.upsert).not.toHaveBeenCalled();
  });

  it('refuses submission when the side has no players', async () => {
    prisma.registration.findMany.mockResolvedValue([eligibleRegistration()]);
    prisma.matchSheet.findUnique.mockResolvedValue({
      id: 'sheet',
      status: MatchSheetStatus.DRAFT,
      homeSubmittedAt: null,
      awaySubmittedAt: null,
      players: [],
    });

    await expect(
      service.submitSide(clubActor(), 'match', 'home-club'),
    ).rejects.toThrow('La composition doit contenir au moins un joueur');

    expect(prisma.matchSheet.update).not.toHaveBeenCalled();
  });

  function clubActor() {
    return {
      userId: 'user',
      memberships: [{ organizationId: 'home-org', role: Role.CLUB_ADMIN }],
    };
  }

  function leagueActor() {
    return {
      userId: 'league-user',
      memberships: [{ organizationId: 'league-org', role: Role.LIGUE_ADMIN }],
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
