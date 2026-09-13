import {
  LicenseStatus,
  MatchSheetPlayerRole,
  PlayerPosition,
  RegistrationCategory,
  RegistrationStatus,
} from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SEASON = '2026-2027';

const VIRTUAL_DRAGONS = [
  { number: 1, firstName: 'Marcel', lastName: 'Houngbo', position: PlayerPosition.GOALKEEPER },
  { number: 2, firstName: 'Rodrigue', lastName: 'Hountondji', position: PlayerPosition.DEFENDER },
  { number: 3, firstName: 'Serge', lastName: 'Kpadonou', position: PlayerPosition.DEFENDER },
  { number: 4, firstName: 'Arnaud', lastName: 'Ahouandjinou', position: PlayerPosition.DEFENDER },
  { number: 5, firstName: 'Junior', lastName: 'Gnonlonfoun', position: PlayerPosition.DEFENDER },
  { number: 6, firstName: 'Wilfried', lastName: 'Dossavi', position: PlayerPosition.MIDFIELDER },
  { number: 7, firstName: 'Marius', lastName: 'Tchibozo', position: PlayerPosition.MIDFIELDER },
  { number: 8, firstName: 'Cédric', lastName: 'Dossou', position: PlayerPosition.MIDFIELDER },
  { number: 9, firstName: 'Kevin', lastName: 'Aïvo', position: PlayerPosition.FORWARD },
  { number: 10, firstName: 'Fabrice', lastName: 'Hounkpatin', position: PlayerPosition.FORWARD },
  { number: 11, firstName: 'Roméo', lastName: 'Adjahouinou', position: PlayerPosition.FORWARD },
] as const;

async function ensurePlayer(
  organizationId: string,
  number: number,
  firstName: string,
  lastName: string,
  position: PlayerPosition,
) {
  const federationId = number === 8
    ? 'TEST-MATCH-SHEET-ELIGIBLE'
    : `VIRTUAL-DRAGONS-2026-${String(number).padStart(2, '0')}`;
  const deduplicationKey = number === 8
    ? 'seed:test:match-sheet:eligible'
    : `seed:virtual:dragons:2026:${number}`;

  const person = await prisma.person.upsert({
    where: { federationId },
    update: { firstName, lastName, nationality: 'Béninoise' },
    create: {
      firstName,
      lastName,
      birthDate: new Date(`200${number % 4}-01-15T00:00:00.000Z`),
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
    update: { position, shirtNumber: number, shirtName: lastName.toUpperCase() },
    create: {
      registrationId: registration.id,
      position,
      shirtNumber: number,
      shirtName: lastName.toUpperCase(),
    },
  });

  const license = await prisma.license.findFirst({
    where: { registrationId: registration.id, season: SEASON },
  });
  const licenseData = {
    status: LicenseStatus.ISSUED_BY_FBF,
    number: `FBF-VIRTUAL-DRAGONS-${String(number).padStart(2, '0')}`,
    validFrom: new Date('2026-08-01T00:00:00.000Z'),
    validUntil: new Date('2027-06-30T00:00:00.000Z'),
    rejectionReason: null,
  };

  if (license) {
    await prisma.license.update({ where: { id: license.id }, data: licenseData });
  } else {
    await prisma.license.create({
      data: { registrationId: registration.id, season: SEASON, ...licenseData },
    });
  }

  return registration;
}

async function main() {
  const dragons = await prisma.organization.findUniqueOrThrow({
    where: { code: 'DRAGONS' },
    include: { club: true },
  });
  const aziza = await prisma.organization.findUniqueOrThrow({
    where: { code: 'AZIZA' },
    include: { club: true },
  });
  if (!dragons.club || !aziza.club) throw new Error('Clubs Dragons/Aziza introuvables');

  const competition = await prisma.competition.findFirstOrThrow({
    where: { code: 'L1-TEST-MATCH-SHEET' },
  });
  const match = await prisma.match.findFirstOrThrow({
    where: {
      competitionId: competition.id,
      homeClubId: dragons.club.id,
      awayClubId: aziza.club.id,
    },
  });
  const sheet = await prisma.matchSheet.upsert({
    where: { matchId: match.id },
    update: {},
    create: { matchId: match.id },
  });

  for (const player of VIRTUAL_DRAGONS) {
    const registration = await ensurePlayer(
      dragons.id,
      player.number,
      player.firstName,
      player.lastName,
      player.position,
    );

    await prisma.matchSheetPlayer.upsert({
      where: {
        matchSheetId_registrationId: {
          matchSheetId: sheet.id,
          registrationId: registration.id,
        },
      },
      update: {
        clubId: dragons.club.id,
        side: 'HOME',
        role: MatchSheetPlayerRole.STARTER,
        shirtNumber: player.number,
      },
      create: {
        matchSheetId: sheet.id,
        registrationId: registration.id,
        clubId: dragons.club.id,
        side: 'HOME',
        role: MatchSheetPlayerRole.STARTER,
        shirtNumber: player.number,
      },
    });
  }

  console.info('✅ Équipe virtuelle Dragons FC chargée.');
  console.info(`MATCH_ID=${match.id}`);
  console.info(`MATCH_SHEET_ID=${sheet.id}`);
  console.info('11 titulaires : numéros 1 à 11.');
  console.info('Test vocal recommandé : « Carton rouge numéro 8 Dragons à la 67e minute »');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
