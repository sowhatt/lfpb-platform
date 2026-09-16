import {
  LicenseStatus,
  MatchOfficialAssignmentStatus,
  MatchOfficialRole,
  MatchSheetPlayerRole,
  MatchSheetStatus,
  MatchStatus,
  PlayerPosition,
  RegistrationCategory,
  RegistrationStatus,
  Role,
} from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SEASON = '2026-2027';
const KICKOFF = new Date('2026-10-25T16:00:00.000Z');

const DRAGONS = [
  ['Marcel', 'Houngbo'], ['Rodrigue', 'Hountondji'], ['Serge', 'Kpadonou'],
  ['Arnaud', 'Ahouandjinou'], ['Junior', 'Gnonlonfoun'], ['Wilfried', 'Dossavi'],
  ['Marius', 'Tchibozo'], ['Cédric', 'Dossou'], ['Kevin', 'Aïvo'],
  ['Fabrice', 'Hounkpatin'], ['Roméo', 'Adjahouinou'],
  ['David', 'Adjovi'], ['Mathias', 'Kouton'], ['Prince', 'Dahou'],
] as const;

const AZIZA = [
  ['Junior', 'Agossa'], ['Samuel', 'Kiki'], ['Ghislain', 'Dahoueto'],
  ['Loïc', 'Ahouangbo'], ['Brice', 'Hounsa'], ['Gildas', 'Soglo'],
  ['Nabil', 'Kora'], ['Mickaël', 'Dahito'], ['Alain', 'Houessou'],
  ['Boris', 'Sossa'], ['Rachid', 'Akindé'],
  ['Olivier', 'Adisso'], ['Sessi', 'Ahouansou'], ['Landry', 'Gandonou'],
] as const;

function position(number: number) {
  if (number === 1) return PlayerPosition.GOALKEEPER;
  if (number <= 5) return PlayerPosition.DEFENDER;
  if (number <= 8) return PlayerPosition.MIDFIELDER;
  return PlayerPosition.FORWARD;
}

async function ensurePlayer(
  organizationId: string,
  clubCode: string,
  number: number,
  firstName: string,
  lastName: string,
) {
  const isExistingDragonEight = clubCode === 'DRAGONS' && number === 8;
  const isExistingAzizaTen = clubCode === 'AZIZA' && number === 10;
  const federationId = isExistingDragonEight
    ? 'TEST-MATCH-SHEET-ELIGIBLE'
    : isExistingAzizaTen
      ? 'TEST-MATCH-SHEET-AZIZA-ELIGIBLE'
      : `PREMATCH-${clubCode}-2026-${String(number).padStart(2, '0')}`;
  const deduplicationKey = isExistingDragonEight
    ? 'seed:test:match-sheet:eligible'
    : isExistingAzizaTen
      ? 'seed:test:match-sheet:aziza:eligible'
      : `seed:prematch:${clubCode.toLowerCase()}:2026:${number}`;

  const person = await prisma.person.upsert({
    where: { federationId },
    update: { firstName, lastName, nationality: 'Béninoise' },
    create: {
      firstName,
      lastName,
      birthDate: new Date(`200${number % 4}-02-15T00:00:00.000Z`),
      nationality: 'Béninoise',
      federationId,
    },
  });

  const registration = await prisma.registration.upsert({
    where: { deduplicationKey },
    update: {
      personId: person.id,
      organizationId,
      category: RegistrationCategory.PLAYER,
      status: RegistrationStatus.VALIDATED,
    },
    create: {
      personId: person.id,
      organizationId,
      category: RegistrationCategory.PLAYER,
      deduplicationKey,
      status: RegistrationStatus.VALIDATED,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
    },
  });

  await prisma.playerProfile.upsert({
    where: { registrationId: registration.id },
    update: { position: position(number), shirtNumber: number, shirtName: lastName.toUpperCase() },
    create: {
      registrationId: registration.id,
      position: position(number),
      shirtNumber: number,
      shirtName: lastName.toUpperCase(),
    },
  });

  const currentLicense = await prisma.license.findFirst({
    where: { registrationId: registration.id, season: SEASON },
  });
  const licenseData = {
    status: LicenseStatus.ISSUED_BY_FBF,
    number: `FBF-PREMATCH-${clubCode}-${String(number).padStart(2, '0')}`,
    validFrom: new Date('2026-08-01T00:00:00.000Z'),
    validUntil: new Date('2027-06-30T00:00:00.000Z'),
    rejectionReason: null,
  };
  if (currentLicense) {
    await prisma.license.update({ where: { id: currentLicense.id }, data: licenseData });
  } else {
    await prisma.license.create({
      data: { registrationId: registration.id, season: SEASON, ...licenseData },
    });
  }

  return registration;
}

async function main() {
  const league = await prisma.organization.findUniqueOrThrow({ where: { code: 'LFPB' } });
  const dragons = await prisma.organization.findUniqueOrThrow({ where: { code: 'DRAGONS' }, include: { club: true } });
  const aziza = await prisma.organization.findUniqueOrThrow({ where: { code: 'AZIZA' }, include: { club: true } });
  if (!dragons.club || !aziza.club) throw new Error('Clubs Dragons/Aziza introuvables');

  const competition = await prisma.competition.findFirstOrThrow({
    where: { code: 'L1-TEST-MATCH-SHEET' },
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
    await prisma.auditLog.deleteMany({
      where: {
        resourceType: 'MatchSheetPlayerControl',
        resourceId: {
          in: (await prisma.matchSheetPlayer.findMany({
            where: { matchSheetId: existingSheet.id },
            select: { id: true },
          })).map((player) => player.id),
        },
      },
    });
    await prisma.matchSheetPlayer.deleteMany({ where: { matchSheetId: existingSheet.id } });
    await prisma.matchSheet.update({
      where: { id: existingSheet.id },
      data: {
        status: MatchSheetStatus.SUBMITTED,
        homeSubmittedAt: new Date(),
        awaySubmittedAt: new Date(),
        validatedAt: null,
        lockedAt: null,
      },
    });
  }

  const sheet = existingSheet ?? await prisma.matchSheet.create({
    data: {
      matchId: match.id,
      status: MatchSheetStatus.SUBMITTED,
      homeSubmittedAt: new Date(),
      awaySubmittedAt: new Date(),
    },
  });

  for (let index = 0; index < DRAGONS.length; index += 1) {
    const number = index + 1;
    const [firstName, lastName] = DRAGONS[index];
    const registration = await ensurePlayer(dragons.id, 'DRAGONS', number, firstName, lastName);
    await prisma.matchSheetPlayer.create({
      data: {
        matchSheetId: sheet.id,
        registrationId: registration.id,
        clubId: dragons.club.id,
        side: 'HOME',
        role: number <= 11
          ? MatchSheetPlayerRole.STARTER
          : MatchSheetPlayerRole.SUBSTITUTE,
        shirtNumber: number,
      },
    });
  }

  for (let index = 0; index < AZIZA.length; index += 1) {
    const number = index + 1;
    const [firstName, lastName] = AZIZA[index];
    const registration = await ensurePlayer(aziza.id, 'AZIZA', number, firstName, lastName);
    await prisma.matchSheetPlayer.create({
      data: {
        matchSheetId: sheet.id,
        registrationId: registration.id,
        clubId: aziza.club.id,
        side: 'AWAY',
        role: number <= 11
          ? MatchSheetPlayerRole.STARTER
          : MatchSheetPlayerRole.SUBSTITUTE,
        shirtNumber: number,
      },
    });
  }

  const officialEmail = (process.env.SEED_OFFICIAL_EMAIL ?? 'arbitre.pilote@lfpb.bj').toLowerCase();
  const officialUser = await prisma.user.findUniqueOrThrow({ where: { email: officialEmail } });
  const officialProfile = await prisma.officialProfile.findUniqueOrThrow({ where: { userId: officialUser.id } });

  const adminMembership = await prisma.membership.findFirst({
    where: { organizationId: league.id, role: Role.LIGUE_ADMIN },
    include: { user: true },
  });
  if (!adminMembership) throw new Error('Aucun administrateur Ligue disponible pour créer la désignation');

  await prisma.matchOfficialAssignment.updateMany({
    where: {
      matchId: match.id,
      officialProfileId: officialProfile.registrationId,
      status: { in: [MatchOfficialAssignmentStatus.DRAFT, MatchOfficialAssignmentStatus.SENT] },
    },
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
    const now = new Date();
    await prisma.matchOfficialAssignment.create({
      data: {
        matchId: match.id,
        officialProfileId: officialProfile.registrationId,
        role: MatchOfficialRole.REFEREE,
        status: MatchOfficialAssignmentStatus.ACCEPTED,
        sentAt: now,
        respondedAt: now,
        createdByUserId: adminMembership.userId,
      },
    });
  }

  console.info('✅ Match de contrôle avant-match prêt.');
  console.info(`MATCH_ID=${match.id}`);
  console.info(`MATCH_SHEET_ID=${sheet.id}`);
  console.info(`OFFICIAL_EMAIL=${officialEmail}`);
  console.info('STATUT_MATCH=SCHEDULED');
  console.info('STATUT_FEUILLE=SUBMITTED');
  console.info('DRAGONS=11 titulaires + 3 remplaçants');
  console.info('AZIZA=11 titulaires + 3 remplaçants');
  console.info('CONTROLES=0/28');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
