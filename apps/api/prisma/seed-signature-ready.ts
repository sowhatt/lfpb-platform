import {
  MatchOfficialAssignmentStatus,
  MatchOfficialRole,
  MatchSheetPlayerRole,
  MatchSheetStatus,
  MatchStatus,
  Role,
} from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const KICKOFF = new Date('2026-10-18T16:00:00.000Z');
const OFFICIAL_EMAIL = (process.env.SEED_OFFICIAL_EMAIL ?? 'arbitre.pilote@lfpb.bj').toLowerCase();
const DRAGONS_EMAIL = (process.env.SEED_CLUB_EMAIL ?? 'admin@dragons.bj').toLowerCase();
const AZIZA_EMAIL = 'admin@aziza.bj';

async function registrations(prefix: 'DRAGONS' | 'AZIZA') {
  const rows = [];
  for (let number = 1; number <= 11; number += 1) {
    const deduplicationKey =
      prefix === 'DRAGONS' && number === 8
        ? 'seed:test:match-sheet:eligible'
        : prefix === 'AZIZA' && number === 10
          ? 'seed:test:match-sheet:aziza:eligible'
          : `seed:prematch:${prefix.toLowerCase()}:2026:${number}`;
    const registration = await prisma.registration.findUnique({ where: { deduplicationKey } });
    if (!registration) {
      throw new Error(`Joueur ${prefix} #${number} introuvable. Exécuter d’abord db:seed:pre-match-control.`);
    }
    rows.push(registration);
  }
  return rows;
}

async function main() {
  const league = await prisma.organization.findUniqueOrThrow({ where: { code: 'LFPB' } });
  const dragons = await prisma.organization.findUniqueOrThrow({ where: { code: 'DRAGONS' }, include: { club: true } });
  const aziza = await prisma.organization.findUniqueOrThrow({ where: { code: 'AZIZA' }, include: { club: true } });
  if (!dragons.club || !aziza.club) throw new Error('Clubs Dragons/Aziza introuvables');

  const competition = await prisma.competition.findFirstOrThrow({ where: { code: 'L1-TEST-MATCH-SHEET' } });
  const dragonsAdmin = await prisma.user.findUniqueOrThrow({ where: { email: DRAGONS_EMAIL } });

  const azizaAdmin = await prisma.user.upsert({
    where: { email: AZIZA_EMAIL },
    update: { passwordHash: dragonsAdmin.passwordHash, active: true },
    create: {
      email: AZIZA_EMAIL,
      passwordHash: dragonsAdmin.passwordHash,
      firstName: 'Administrateur',
      lastName: 'Aziza',
      active: true,
    },
  });
  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: azizaAdmin.id,
        organizationId: aziza.id,
        role: Role.CLUB_ADMIN,
      },
    },
    update: {},
    create: { userId: azizaAdmin.id, organizationId: aziza.id, role: Role.CLUB_ADMIN },
  });

  let match = await prisma.match.findFirst({
    where: {
      competitionId: competition.id,
      homeClubId: dragons.club.id,
      awayClubId: aziza.club.id,
      kickoffAt: KICKOFF,
    },
  });
  if (!match) {
    match = await prisma.match.create({
      data: {
        competitionId: competition.id,
        homeClubId: dragons.club.id,
        awayClubId: aziza.club.id,
        kickoffAt: KICKOFF,
        status: MatchStatus.SCHEDULED,
      },
    });
  } else {
    match = await prisma.match.update({
      where: { id: match.id },
      data: { status: MatchStatus.SCHEDULED, homeScore: null, awayScore: null },
    });
  }

  const existingSheet = await prisma.matchSheet.findUnique({ where: { matchId: match.id } });
  if (existingSheet) {
    const oldPlayers = await prisma.matchSheetPlayer.findMany({ where: { matchSheetId: existingSheet.id }, select: { id: true } });
    if (oldPlayers.length) {
      await prisma.auditLog.deleteMany({
        where: { resourceType: 'MatchSheetPlayerControl', resourceId: { in: oldPlayers.map((player) => player.id) } },
      });
    }
    await prisma.auditLog.deleteMany({
      where: { resourceType: 'MatchSheetSignature', resourceId: existingSheet.id },
    });
    await prisma.matchSheetPlayer.deleteMany({ where: { matchSheetId: existingSheet.id } });
  }

  const now = new Date();
  const sheet = existingSheet
    ? await prisma.matchSheet.update({
        where: { id: existingSheet.id },
        data: {
          status: MatchSheetStatus.LOCKED,
          homeSubmittedAt: now,
          awaySubmittedAt: now,
          validatedAt: now,
          lockedAt: now,
        },
      })
    : await prisma.matchSheet.create({
        data: {
          matchId: match.id,
          status: MatchSheetStatus.LOCKED,
          homeSubmittedAt: now,
          awaySubmittedAt: now,
          validatedAt: now,
          lockedAt: now,
        },
      });

  const homeRegistrations = await registrations('DRAGONS');
  const awayRegistrations = await registrations('AZIZA');
  const createdPlayers = [];

  for (let index = 0; index < homeRegistrations.length; index += 1) {
    const player = await prisma.matchSheetPlayer.create({
      data: {
        matchSheetId: sheet.id,
        registrationId: homeRegistrations[index].id,
        clubId: dragons.club.id,
        side: 'HOME',
        role: MatchSheetPlayerRole.STARTER,
        shirtNumber: index + 1,
      },
    });
    createdPlayers.push(player);
  }
  for (let index = 0; index < awayRegistrations.length; index += 1) {
    const player = await prisma.matchSheetPlayer.create({
      data: {
        matchSheetId: sheet.id,
        registrationId: awayRegistrations[index].id,
        clubId: aziza.club.id,
        side: 'AWAY',
        role: MatchSheetPlayerRole.STARTER,
        shirtNumber: index + 1,
      },
    });
    createdPlayers.push(player);
  }

  const officialUser = await prisma.user.findUniqueOrThrow({ where: { email: OFFICIAL_EMAIL } });
  const officialProfile = await prisma.officialProfile.findUniqueOrThrow({ where: { userId: officialUser.id } });
  const leagueAdmin = await prisma.membership.findFirstOrThrow({
    where: { organizationId: league.id, role: Role.LIGUE_ADMIN },
  });

  await prisma.matchOfficialAssignment.updateMany({
    where: { matchId: match.id, status: { in: [MatchOfficialAssignmentStatus.DRAFT, MatchOfficialAssignmentStatus.SENT] } },
    data: { status: MatchOfficialAssignmentStatus.CANCELLED },
  });
  const accepted = await prisma.matchOfficialAssignment.findFirst({
    where: {
      matchId: match.id,
      officialProfileId: officialProfile.registrationId,
      status: MatchOfficialAssignmentStatus.ACCEPTED,
    },
  });
  if (!accepted) {
    await prisma.matchOfficialAssignment.create({
      data: {
        matchId: match.id,
        officialProfileId: officialProfile.registrationId,
        role: MatchOfficialRole.REFEREE,
        status: MatchOfficialAssignmentStatus.ACCEPTED,
        sentAt: now,
        respondedAt: now,
        createdByUserId: leagueAdmin.userId,
      },
    });
  }

  await prisma.auditLog.createMany({
    data: createdPlayers.map((player) => ({
      actorUserId: officialUser.id,
      organizationId: league.id,
      action: 'MATCH_SHEET_PLAYER_CONTROL_VERIFIED',
      resourceType: 'MatchSheetPlayerControl',
      resourceId: player.id,
      metadata: {
        matchId: match!.id,
        sheetId: sheet.id,
        registrationId: player.registrationId,
        clubId: player.clubId,
        side: player.side,
        role: player.role,
        shirtNumber: player.shirtNumber,
        reason: null,
        note: 'SEED_SIGNATURE_READY',
      },
    })),
  });

  console.info('✅ Match prêt pour le test des signatures.');
  console.info(`MATCH_ID=${match.id}`);
  console.info(`MATCH_SHEET_ID=${sheet.id}`);
  console.info('STATUT_FEUILLE=LOCKED');
  console.info('CONTROLES=22/22 VERIFIED');
  console.info('SIGNATURES=0/3');
  console.info(`CLUB_DOMICILE_EMAIL=${DRAGONS_EMAIL}`);
  console.info(`CLUB_EXTERIEUR_EMAIL=${AZIZA_EMAIL}`);
  console.info(`OFFICIAL_EMAIL=${OFFICIAL_EMAIL}`);
  console.info('Le compte Aziza utilise le même mot de passe que le compte Dragons pour ce test.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
