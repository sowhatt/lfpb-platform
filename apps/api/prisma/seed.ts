import { Division, OrganizationType, Role } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function upsertUser(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
) {
  const passwordHash = await hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: { passwordHash, active: true },
    create: { email, passwordHash, firstName, lastName },
  });
}

async function main(): Promise<void> {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@lfpb.bj').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const clubEmail = (process.env.SEED_CLUB_EMAIL ?? 'admin@dragons.bj').toLowerCase();
  const clubPassword = process.env.SEED_CLUB_PASSWORD;

  if (!adminPassword || adminPassword.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD doit contenir au moins 12 caractères');
  }
  if (!clubPassword || clubPassword.length < 12) {
    throw new Error('SEED_CLUB_PASSWORD doit contenir au moins 12 caractères');
  }

  const league = await prisma.organization.upsert({
    where: { code: 'LFPB' },
    update: {},
    create: {
      name: 'Ligue de Football Professionnel du Bénin',
      code: 'LFPB',
      type: OrganizationType.LEAGUE,
    },
  });

  const clubs = new Map<string, string>();
  for (const club of [
    { name: 'Dragons FC de l’Ouémé', code: 'DRAGONS', shortName: 'Dragons FC', division: Division.LIGUE_1, city: 'Porto-Novo' },
    { name: 'RC Aziza FC', code: 'AZIZA', shortName: 'RC Aziza', division: Division.LIGUE_1, city: 'Cotonou' },
    { name: 'Béké FC', code: 'BEKE', shortName: 'Béké FC', division: Division.LIGUE_1, city: 'Bembèrèkè' },
  ]) {
    const organization = await prisma.organization.upsert({
      where: { code: club.code },
      update: {},
      create: {
        name: club.name,
        code: club.code,
        type: OrganizationType.CLUB,
        club: { create: { shortName: club.shortName, division: club.division, city: club.city } },
      },
    });
    clubs.set(club.code, organization.id);
  }

  const leagueAdmin = await upsertUser(adminEmail, adminPassword, 'Administrateur', 'LFPB');
  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: leagueAdmin.id,
        organizationId: league.id,
        role: Role.LIGUE_ADMIN,
      },
    },
    update: {},
    create: { userId: leagueAdmin.id, organizationId: league.id, role: Role.LIGUE_ADMIN },
  });

  const dragonsId = clubs.get('DRAGONS');
  if (!dragonsId) throw new Error('Organisation DRAGONS introuvable');

  const clubAdmin = await upsertUser(clubEmail, clubPassword, 'Administrateur', 'Dragons');
  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: clubAdmin.id,
        organizationId: dragonsId,
        role: Role.CLUB_ADMIN,
      },
    },
    update: {},
    create: { userId: clubAdmin.id, organizationId: dragonsId, role: Role.CLUB_ADMIN },
  });

  console.info(`Compte Ligue créé : ${adminEmail}`);
  console.info(`Compte Dragons créé : ${clubEmail}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
