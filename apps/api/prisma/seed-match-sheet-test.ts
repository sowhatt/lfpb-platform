import {
  CompetitionFormat,
  CompetitionStatus,
  Division,
  LicenseStatus,
  MatchSheetPlayerRole,
  MatchStatus,
  PlayerPosition,
  RegistrationCategory,
  RegistrationStatus,
  SeasonStatus,
} from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SEASON = '2026-2027';

async function ensurePlayer(
  organizationId: string,
  federationId: string,
  deduplicationKey: string,
  firstName: string,
  lastName: string,
  licenseStatus: LicenseStatus,
  shirtNumber: number,
) {
  const person = await prisma.person.upsert({
    where: { federationId },
    update: { firstName, lastName },
    create: {
      firstName,
      lastName,
      birthDate: new Date('2002-01-01T00:00:00.000Z'),
      nationality: 'Béninoise',
      federationId,
    },
  });
  const registration = await prisma.registration.upsert({
    where: { deduplicationKey },
    update: { organizationId, status: RegistrationStatus.VALIDATED },
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
    update: { position: PlayerPosition.MIDFIELDER, shirtNumber },
    create: {
      registrationId: registration.id,
      position: PlayerPosition.MIDFIELDER,
      shirtNumber,
    },
  });
  const current = await prisma.license.findFirst({
    where: { registrationId: registration.id, season: SEASON },
  });
  const data = licenseStatus === LicenseStatus.ISSUED_BY_FBF
    ? {
        status: licenseStatus,
        number: `FBF-MATCH-${shirtNumber}`,
        validFrom: new Date('2026-08-01T00:00:00.000Z'),
        validUntil: new Date('2027-06-30T00:00:00.000Z'),
        rejectionReason: null,
      }
    : {
        status: licenseStatus,
        number: null,
        validFrom: null,
        validUntil: null,
        rejectionReason: 'Refus FBF de test feuille de match',
      };
  if (current) {
    await prisma.license.update({ where: { id: current.id }, data });
  } else {
    await prisma.license.create({
      data: { registrationId: registration.id, season: SEASON, ...data },
    });
  }
  return registration;
}

async function main() {
  const league = await prisma.organization.findUniqueOrThrow({ where: { code: 'LFPB' } });
  const dragonsOrg = await prisma.organization.findUniqueOrThrow({ where: { code: 'DRAGONS' }, include: { club: true } });
  const azizaOrg = await prisma.organization.findUniqueOrThrow({ where: { code: 'AZIZA' }, include: { club: true } });
  if (!dragonsOrg.club || !azizaOrg.club) throw new Error('Clubs de démonstration introuvables');

  const season = await prisma.season.upsert({
    where: { name: SEASON },
    update: { status: SeasonStatus.ACTIVE },
    create: {
      name: SEASON,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2027-06-30T00:00:00.000Z'),
      status: SeasonStatus.ACTIVE,
    },
  });
  const competition = await prisma.competition.upsert({
    where: { seasonId_code: { seasonId: season.id, code: 'L1-TEST-MATCH-SHEET' } },
    update: { status: CompetitionStatus.PUBLISHED },
    create: {
      organizationId: league.id,
      seasonId: season.id,
      name: 'Ligue 1 - Test feuille de match',
      code: 'L1-TEST-MATCH-SHEET',
      division: Division.LIGUE_1,
      format: CompetitionFormat.DOUBLE_ROUND_ROBIN,
      status: CompetitionStatus.PUBLISHED,
    },
  });
  const existingMatch = await prisma.match.findFirst({
    where: { competitionId: competition.id, homeClubId: dragonsOrg.club.id, awayClubId: azizaOrg.club.id },
  });
  const match = existingMatch ?? await prisma.match.create({
    data: {
      competitionId: competition.id,
      homeClubId: dragonsOrg.club.id,
      awayClubId: azizaOrg.club.id,
      kickoffAt: new Date('2026-10-10T16:00:00.000Z'),
      status: MatchStatus.SCHEDULED,
    },
  });

  const eligible = await ensurePlayer(
    dragonsOrg.id,
    'TEST-MATCH-SHEET-ELIGIBLE',
    'seed:test:match-sheet:eligible',
    'Cédric',
    'Dossou',
    LicenseStatus.ISSUED_BY_FBF,
    8,
  );
  const rejected = await ensurePlayer(
    dragonsOrg.id,
    'TEST-MATCH-SHEET-REJECTED',
    'seed:test:match-sheet:rejected',
    'Jean',
    'Adjovi',
    LicenseStatus.REJECTED_BY_FBF,
    14,
  );
  const awayEligible = await ensurePlayer(
    azizaOrg.id,
    'TEST-MATCH-SHEET-AZIZA-ELIGIBLE',
    'seed:test:match-sheet:aziza:eligible',
    'Boris',
    'Sossa',
    LicenseStatus.ISSUED_BY_FBF,
    10,
  );

  const sheet = await prisma.matchSheet.upsert({
    where: { matchId: match.id },
    update: {},
    create: { matchId: match.id },
  });
  await prisma.matchSheetPlayer.upsert({
    where: { matchSheetId_registrationId: { matchSheetId: sheet.id, registrationId: eligible.id } },
    update: { clubId: dragonsOrg.club.id, side: 'HOME', role: MatchSheetPlayerRole.STARTER, shirtNumber: 8 },
    create: {
      matchSheetId: sheet.id,
      registrationId: eligible.id,
      clubId: dragonsOrg.club.id,
      side: 'HOME',
      role: MatchSheetPlayerRole.STARTER,
      shirtNumber: 8,
    },
  });
  await prisma.matchSheetPlayer.upsert({
    where: { matchSheetId_registrationId: { matchSheetId: sheet.id, registrationId: awayEligible.id } },
    update: { clubId: azizaOrg.club.id, side: 'AWAY', role: MatchSheetPlayerRole.STARTER, shirtNumber: 10 },
    create: {
      matchSheetId: sheet.id,
      registrationId: awayEligible.id,
      clubId: azizaOrg.club.id,
      side: 'AWAY',
      role: MatchSheetPlayerRole.STARTER,
      shirtNumber: 10,
    },
  });

  console.info('C2A prêt.');
  console.info(`MATCH_ID=${match.id}`);
  console.info(`DRAGONS_CLUB_ID=${dragonsOrg.club.id}`);
  console.info(`AZIZA_CLUB_ID=${azizaOrg.club.id}`);
  console.info(`ELIGIBLE_REGISTRATION_ID=${eligible.id}`);
  console.info(`REJECTED_REGISTRATION_ID=${rejected.id}`);
  console.info(`AZIZA_ELIGIBLE_REGISTRATION_ID=${awayEligible.id}`);
  console.info(`MATCH_SHEET_ID=${sheet.id}`);
  console.info('Cédric Dossou : Dragons, titulaire HOME #8.');
  console.info('Boris Sossa : Aziza, titulaire AWAY #10 avec licence ISSUED_BY_FBF.');
  console.info('Jean Adjovi : licence REJECTED_BY_FBF, doit rester refusé.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
