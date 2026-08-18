import { Division, OrganizationType, Role } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@lfpb.bj').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!password || password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD doit contenir au moins 12 caractères');
  }

  const league = await prisma.organization.upsert({
    where: { code: 'LFPB' },
    update: {},
    create: { name: 'Ligue de Football Professionnel du Bénin', code: 'LFPB', type: OrganizationType.LEAGUE },
  });

  for (const club of [
    { name: 'Dragons FC de l’Ouémé', code: 'DRAGONS', shortName: 'Dragons FC', division: Division.LIGUE_1, city: 'Porto-Novo' },
    { name: 'RC Aziza FC', code: 'AZIZA', shortName: 'RC Aziza', division: Division.LIGUE_1, city: 'Cotonou' },
    { name: 'Béké FC', code: 'BEKE', shortName: 'Béké FC', division: Division.LIGUE_1, city: 'Bembèrèkè' },
  ]) {
    await prisma.organization.upsert({
      where: { code: club.code },
      update: {},
      create: {
        name: club.name,
        code: club.code,
        type: OrganizationType.CLUB,
        club: { create: { shortName: club.shortName, division: club.division, city: club.city } },
      },
    });
  }

  const admin = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: await hash(password, 12), active: true },
    create: {
      email,
      passwordHash: await hash(password, 12),
      firstName: 'Administrateur',
      lastName: 'LFPB',
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: admin.id,
        organizationId: league.id,
        role: Role.LIGUE_ADMIN,
      },
    },
    update: {},
    create: { userId: admin.id, organizationId: league.id, role: Role.LIGUE_ADMIN },
  });

  console.info(`Compte administrateur créé : ${email}`);
}

main()
  .finally(async () => prisma.$disconnect());
