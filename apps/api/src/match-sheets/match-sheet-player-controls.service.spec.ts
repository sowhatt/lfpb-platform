import {
  MatchOfficialAssignmentStatus,
  MatchSheetStatus,
  Role,
} from '@prisma/client';
import { MatchSheetPlayerControlStatus } from './dto/control-match-sheet-player.dto';
import { MatchSheetPlayerControlsService } from './match-sheet-player-controls.service';

describe('MatchSheetPlayerControlsService', () => {
  const prisma = {
    matchSheet: { findUnique: jest.fn() },
    officialProfile: { findUnique: jest.fn() },
    matchOfficialAssignment: { findFirst: jest.fn() },
    auditLog: { findMany: jest.fn(), create: jest.fn() },
  } as any;

  const service = new MatchSheetPlayerControlsService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.officialProfile.findUnique.mockResolvedValue({ registrationId: 'official-registration' });
    prisma.matchOfficialAssignment.findFirst.mockResolvedValue({ id: 'assignment', status: MatchOfficialAssignmentStatus.ACCEPTED });
  });

  it('persists a verified control by the assigned official', async () => {
    prisma.matchSheet.findUnique.mockResolvedValue(submittedSheet());
    prisma.auditLog.create.mockResolvedValue({ createdAt: new Date('2026-09-14T20:00:00.000Z') });

    const result = await service.controlPlayer(officialActor(), 'match', 'registration-home', {
      status: MatchSheetPlayerControlStatus.VERIFIED,
    });

    expect(result.status).toBe(MatchSheetPlayerControlStatus.VERIFIED);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actorUserId: 'official-user',
        action: 'MATCH_SHEET_PLAYER_CONTROL_VERIFIED',
        resourceType: 'MatchSheetPlayerControl',
        resourceId: 'sheet-player-home',
      }),
    }));
  });

  it('requires a reason when an anomaly is reported', async () => {
    prisma.matchSheet.findUnique.mockResolvedValue(submittedSheet());

    await expect(service.controlPlayer(officialActor(), 'match', 'registration-home', {
      status: MatchSheetPlayerControlStatus.ANOMALY,
    })).rejects.toThrow('Le motif est obligatoire');

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns persistent progress using the latest control per player', async () => {
    prisma.matchSheet.findUnique.mockResolvedValue({
      id: 'sheet',
      status: MatchSheetStatus.SUBMITTED,
      players: [
        { id: 'sheet-player-home', registrationId: 'registration-home', clubId: 'home-club', side: 'HOME', role: 'STARTER', shirtNumber: 8 },
        { id: 'sheet-player-away', registrationId: 'registration-away', clubId: 'away-club', side: 'AWAY', role: 'STARTER', shirtNumber: 10 },
      ],
    });
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 'latest-home', resourceId: 'sheet-player-home', actorUserId: 'official-user', action: 'MATCH_SHEET_PLAYER_CONTROL_VERIFIED', metadata: {}, createdAt: new Date('2026-09-14T20:10:00.000Z') },
      { id: 'old-home', resourceId: 'sheet-player-home', actorUserId: 'official-user', action: 'MATCH_SHEET_PLAYER_CONTROL_ANOMALY', metadata: { reason: 'ancienne anomalie' }, createdAt: new Date('2026-09-14T20:05:00.000Z') },
    ]);

    const result = await service.list(officialActor(), 'match');

    expect(result.total).toBe(2);
    expect(result.verified).toBe(1);
    expect(result.anomalies).toBe(0);
    expect(result.pending).toBe(1);
    expect(result.complete).toBe(false);
    expect(result.controls.find((control) => control.registrationId === 'registration-home')?.status).toBe('VERIFIED');
  });

  it('blocks locking while one player is pending or anomalous', async () => {
    prisma.matchSheet.findUnique.mockResolvedValue({
      id: 'sheet',
      status: MatchSheetStatus.SUBMITTED,
      players: [
        { id: 'sheet-player-home', registrationId: 'registration-home', clubId: 'home-club', side: 'HOME', role: 'STARTER', shirtNumber: 8 },
        { id: 'sheet-player-away', registrationId: 'registration-away', clubId: 'away-club', side: 'AWAY', role: 'STARTER', shirtNumber: 10 },
      ],
    });
    prisma.auditLog.findMany.mockResolvedValue([
      { resourceId: 'sheet-player-home', actorUserId: 'official-user', action: 'MATCH_SHEET_PLAYER_CONTROL_VERIFIED', metadata: {}, createdAt: new Date() },
      { resourceId: 'sheet-player-away', actorUserId: 'official-user', action: 'MATCH_SHEET_PLAYER_CONTROL_ANOMALY', metadata: { reason: 'photo non concordante' }, createdAt: new Date() },
    ]);

    await expect(service.assertAllVerified(officialActor(), 'match')).rejects.toThrow('Contrôle terrain incomplet');
  });

  it('allows the lock precondition once every player is verified', async () => {
    prisma.matchSheet.findUnique.mockResolvedValue({
      id: 'sheet',
      status: MatchSheetStatus.SUBMITTED,
      players: [
        { id: 'sheet-player-home', registrationId: 'registration-home', clubId: 'home-club', side: 'HOME', role: 'STARTER', shirtNumber: 8 },
        { id: 'sheet-player-away', registrationId: 'registration-away', clubId: 'away-club', side: 'AWAY', role: 'STARTER', shirtNumber: 10 },
      ],
    });
    prisma.auditLog.findMany.mockResolvedValue([
      { resourceId: 'sheet-player-home', actorUserId: 'official-user', action: 'MATCH_SHEET_PLAYER_CONTROL_VERIFIED', metadata: {}, createdAt: new Date() },
      { resourceId: 'sheet-player-away', actorUserId: 'official-user', action: 'MATCH_SHEET_PLAYER_CONTROL_VERIFIED', metadata: {}, createdAt: new Date() },
    ]);

    const result = await service.assertAllVerified(officialActor(), 'match');
    expect(result.complete).toBe(true);
    expect(result.verified).toBe(2);
  });

  function officialActor() {
    return {
      userId: 'official-user',
      memberships: [{ organizationId: 'league-org', role: Role.OFFICIEL }],
    };
  }

  function submittedSheet() {
    return {
      id: 'sheet',
      status: MatchSheetStatus.SUBMITTED,
      match: { competition: { organizationId: 'league-org' } },
      players: [
        { id: 'sheet-player-home', registrationId: 'registration-home', clubId: 'home-club', side: 'HOME', role: 'STARTER', shirtNumber: 8 },
      ],
    };
  }
});
