import {
  LicenseStatus,
  PlayerPosition,
  RegistrationCategory,
  RegistrationStatus,
} from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEST_FEDERATION_ID = 'TEST-APPROVAL-GUARD-001';
const TEST_REGISTRATION_KEY = 'seed:test:approval-guard:001';
const TEST_SEASON = '2026-2027';

async function main(): Promise<void> {
  const dragons = await prisma.organization.findUnique({
    where: { code: 'DRAGONS' },
  });

  if (!dragons) {
    throw new Error('Organisation DRAGONS introuvable. Exécutez d’abord le seed principal.');
  }

  const person = await prisma.person.upsert({
    where: { federationId: TEST_FEDERATION_ID },
    update: {
      firstName: 'Armand',
      lastName: 'Hounkpe',
      birthDate: new Date('2002-09-18T00:00:00.000Z'),
      nationality: 'Béninoise',
    },
    create: {
      firstName: 'Armand',
      lastName: 'Hounkpe',
      birthDate: new Date('2002-09-18T00:00:00.000Z'),
      nationality: 'Béninoise',
      federationId: TEST_FEDERATION_ID,
    },
  });

  const registration = await prisma.registration.upsert({
    where: { deduplicationKey: TEST_REGISTRATION_KEY },
    update: {
      personId: person.id,
      organizationId: dragons.id,
      category: RegistrationCategory.PLAYER,
      status: RegistrationStatus.DRAFT,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
    },
    create: {
      personId: person.id,
      organizationId: dragons.id,
      category: RegistrationCategory.PLAYER,
      deduplicationKey: TEST_REGISTRATION_KEY,
      status: RegistrationStatus.DRAFT,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
    },
  });

  await prisma.playerProfile.upsert({
    where: { registrationId: registration.id },
    update: {
      position: PlayerPosition.MIDFIELDER,
      shirtName: 'HOUNKPE',
      shirtNumber: 18,
    },
    create: {
      registrationId: registration.id,
      position: PlayerPosition.MIDFIELDER,
      shirtName: 'HOUNKPE',
      shirtNumber: 18,
    },
  });

  const existingLicense = await prisma.license.findFirst({
    where: {
      registrationId: registration.id,
      season: TEST_SEASON,
    },
    orderBy: { createdAt: 'asc' },
  });

  const license = existingLicense
    ? await prisma.license.update({
        where: { id: existingLicense.id },
        data: {
          status: LicenseStatus.DRAFT,
          rejectionReason: null,
          number: null,
          validFrom: null,
          validUntil: null,
        },
      })
    : await prisma.license.create({
        data: {
          registrationId: registration.id,
          season: TEST_SEASON,
          status: LicenseStatus.DRAFT,
        },
      });

  await prisma.registrationDocument.deleteMany({
    where: { registrationId: registration.id },
  });

  console.info('Dossier de test du blocage Avis favorable prêt.');
  console.info(`Joueur : ${person.firstName} ${person.lastName}`);
  console.info(`Identifiant test : ${TEST_FEDERATION_ID}`);
  console.info(`Licence : ${license.id}`);
  console.info(`Saison : ${TEST_SEASON}`);
  console.info('Statut : DRAFT');
  console.info('Scénario : déposer 7 pièces, soumettre, en valider 6, laisser 1 À contrôler, puis cliquer Avis favorable.');
  console.info('Résultat attendu : refus backend et maintien du statut Soumis à la LFPB.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
