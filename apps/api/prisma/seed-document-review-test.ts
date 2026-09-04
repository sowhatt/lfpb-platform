import {
  LicenseStatus,
  PlayerPosition,
  RegistrationCategory,
  RegistrationStatus,
} from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEST_FEDERATION_ID = 'TEST-DOC-REJECT-001';
const TEST_REGISTRATION_KEY = 'seed:test:document-rejection:001';
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
      firstName: 'Michel',
      lastName: 'Agossou',
      birthDate: new Date('2001-04-12T00:00:00.000Z'),
      nationality: 'Béninoise',
    },
    create: {
      firstName: 'Michel',
      lastName: 'Agossou',
      birthDate: new Date('2001-04-12T00:00:00.000Z'),
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
      position: PlayerPosition.DEFENDER,
      shirtName: 'AGOSSOU',
      shirtNumber: 24,
    },
    create: {
      registrationId: registration.id,
      position: PlayerPosition.DEFENDER,
      shirtName: 'AGOSSOU',
      shirtNumber: 24,
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

  // Le scénario doit être rejouable : on repart sans pièces documentaires.
  await prisma.registrationDocument.deleteMany({
    where: { registrationId: registration.id },
  });

  console.info('Dossier de test de rejet documentaire prêt.');
  console.info(`Joueur : ${person.firstName} ${person.lastName}`);
  console.info(`Identifiant test : ${TEST_FEDERATION_ID}`);
  console.info(`Licence : ${license.id}`);
  console.info(`Saison : ${TEST_SEASON}`);
  console.info('Statut : DRAFT');
  console.info('Pièces : 0 (prêt pour un nouveau test de dépôt/rejet)');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
