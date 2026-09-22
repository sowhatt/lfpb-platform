import {
  MatchOfficialAssignmentStatus,
  MatchOfficialRole,
  OfficialFunction,
  RegistrationCategory,
  RegistrationStatus,
  Role,
} from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const TARGET_KICKOFF = new Date('2026-10-11T16:00:00.000Z');
const DEFAULT_PASSWORD = 'DigitalFoot!2026';

type RecipeOfficial = {
  email: string;
  firstName: string;
  lastName: string;
  federationId: string;
  deduplicationKey: string;
  function: OfficialFunction;
  role: MatchOfficialRole;
  label: string;
};

const OFFICIALS: RecipeOfficial[] = [
  {
    email: 'recette.arbitre@digitalfoot.test',
    firstName: 'Armand',
    lastName: 'Arbitre',
    federationId: 'RECETTE-OFFICIAL-REFEREE',
    deduplicationKey: 'seed:recipe:official:referee',
    function: OfficialFunction.REFEREE,
    role: MatchOfficialRole.REFEREE,
    label: 'Arbitre central',
  },
  {
    email: 'recette.assistant1@digitalfoot.test',
    firstName: 'Alain',
    lastName: 'Assistant Un',
    federationId: 'RECETTE-OFFICIAL-ASSISTANT-1',
    deduplicationKey: 'seed:recipe:official:assistant-1',
    function: OfficialFunction.ASSISTANT_REFEREE,
    role: MatchOfficialRole.ASSISTANT_REFEREE_1,
    label: 'Arbitre assistant 1',
  },
  {
    email: 'recette.assistant2@digitalfoot.test',
    firstName: 'Alex',
    lastName: 'Assistant Deux',
    federationId: 'RECETTE-OFFICIAL-ASSISTANT-2',
    deduplicationKey: 'seed:recipe:official:assistant-2',
    function: OfficialFunction.ASSISTANT_REFEREE,
    role: MatchOfficialRole.ASSISTANT_REFEREE_2,
    label: 'Arbitre assistant 2',
  },
  {
    email: 'recette.quatrieme@digitalfoot.test',
    firstName: 'Quentin',
    lastName: 'Quatrième',
    federationId: 'RECETTE-OFFICIAL-FOURTH',
    deduplicationKey: 'seed:recipe:official:fourth',
    function: OfficialFunction.FOURTH_OFFICIAL,
    role: MatchOfficialRole.FOURTH_OFFICIAL,
    label: 'Quatrième officiel',
  },
  {
    email: 'recette.commissaire@digitalfoot.test',
    firstName: 'Comlan',
    lastName: 'Commissaire',
    federationId: 'RECETTE-OFFICIAL-COMMISSIONER',
    deduplicationKey: 'seed:recipe:official:commissioner',
    function: OfficialFunction.MATCH_COMMISSIONER,
    role: MatchOfficialRole.MATCH_COMMISSIONER,
    label: 'Commissaire au match',
  },
  {
    email: 'recette.delegue@digitalfoot.test',
    firstName: 'David',
    lastName: 'Délégué',
    federationId: 'RECETTE-OFFICIAL-DELEGATE',
    deduplicationKey: 'seed:recipe:official:delegate',
    function: OfficialFunction.DELEGATE,
    role: MatchOfficialRole.DELEGATE,
    label: 'Délégué',
  },
];

function assertSafeEnvironment() {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  let hostname = '';

  try {
    hostname = new URL(databaseUrl).hostname;
  } catch {
    throw new Error(
      'DATABASE_URL invalide ou absente. Seed de recette annulé.',
    );
  }

  const localHosts = new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    'host.docker.internal',
  ]);

  if (nodeEnv === 'production') {
    throw new Error(
      'Seed de recette interdit avec NODE_ENV=production.',
    );
  }

  if (!localHosts.has(hostname)) {
    throw new Error(
      `Seed de recette interdit sur la base "${hostname}". Seule une base locale est autorisée.`,
    );
  }

  console.info(`✅ Sécurité environnement : ${nodeEnv} / ${hostname}`);
}

async function ensureOfficial(
  leagueId: string,
  recipe: RecipeOfficial,
  passwordHash: string,
) {
  const user = await prisma.user.upsert({
    where: { email: recipe.email },
    update: {
      passwordHash,
      firstName: recipe.firstName,
      lastName: recipe.lastName,
      active: true,
    },
    create: {
      email: recipe.email,
      passwordHash,
      firstName: recipe.firstName,
      lastName: recipe.lastName,
      active: true,
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: user.id,
        organizationId: leagueId,
        role: Role.OFFICIEL,
      },
    },
    update: {
      status: 'ACTIVE',
    },
    create: {
      userId: user.id,
      organizationId: leagueId,
      role: Role.OFFICIEL,
    },
  });

  const person = await prisma.person.upsert({
    where: { federationId: recipe.federationId },
    update: {
      firstName: recipe.firstName,
      lastName: recipe.lastName,
      nationality: 'Béninoise',
    },
    create: {
      firstName: recipe.firstName,
      lastName: recipe.lastName,
      birthDate: new Date('1990-01-01T00:00:00.000Z'),
      nationality: 'Béninoise',
      federationId: recipe.federationId,
    },
  });

  const registration = await prisma.registration.upsert({
    where: {
      deduplicationKey: recipe.deduplicationKey,
    },
    update: {
      personId: person.id,
      organizationId: leagueId,
      category: RegistrationCategory.OFFICIAL,
      status: RegistrationStatus.VALIDATED,
    },
    create: {
      personId: person.id,
      organizationId: leagueId,
      category: RegistrationCategory.OFFICIAL,
      deduplicationKey: recipe.deduplicationKey,
      status: RegistrationStatus.VALIDATED,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
    },
  });

  const profileByUser = await prisma.officialProfile.findUnique({
    where: { userId: user.id },
  });

  if (
    profileByUser &&
    profileByUser.registrationId !== registration.id
  ) {
    throw new Error(
      `Le compte ${recipe.email} est déjà lié à un autre profil officiel.`,
    );
  }

  await prisma.officialProfile.upsert({
    where: {
      registrationId: registration.id,
    },
    update: {
      userId: user.id,
      function: recipe.function,
      grade: 'Recette métier',
    },
    create: {
      registrationId: registration.id,
      userId: user.id,
      function: recipe.function,
      grade: 'Recette métier',
    },
  });

  return {
    user,
    registrationId: registration.id,
  };
}

async function assignOfficial(
  matchId: string,
  officialProfileId: string,
  role: MatchOfficialRole,
  createdByUserId: string,
) {
  await prisma.matchOfficialAssignment.updateMany({
    where: {
      matchId,
      role,
      status: {
        not: MatchOfficialAssignmentStatus.CANCELLED,
      },
      NOT: {
        officialProfileId,
      },
    },
    data: {
      status: MatchOfficialAssignmentStatus.CANCELLED,
      responseReason: 'Remplacé par le seed de recette Officiel',
    },
  });

  await prisma.matchOfficialAssignment.updateMany({
    where: {
      matchId,
      officialProfileId,
      status: {
        not: MatchOfficialAssignmentStatus.CANCELLED,
      },
      NOT: {
        role,
      },
    },
    data: {
      status: MatchOfficialAssignmentStatus.CANCELLED,
      responseReason: 'Ancienne désignation remplacée par le seed de recette',
    },
  });

  const existing = await prisma.matchOfficialAssignment.findFirst({
    where: {
      matchId,
      officialProfileId,
      role,
      status: {
        not: MatchOfficialAssignmentStatus.CANCELLED,
      },
    },
  });

  const now = new Date();

  if (existing) {
    return prisma.matchOfficialAssignment.update({
      where: { id: existing.id },
      data: {
        status: MatchOfficialAssignmentStatus.ACCEPTED,
        sentAt: existing.sentAt ?? now,
        respondedAt: now,
        responseReason: null,
      },
    });
  }

  return prisma.matchOfficialAssignment.create({
    data: {
      matchId,
      officialProfileId,
      role,
      status: MatchOfficialAssignmentStatus.ACCEPTED,
      sentAt: now,
      respondedAt: now,
      createdByUserId,
    },
  });
}

async function main() {
  assertSafeEnvironment();

  const password =
    process.env.SEED_OFFICIAL_RECIPE_PASSWORD ?? DEFAULT_PASSWORD;

  if (password.length < 12) {
    throw new Error(
      'SEED_OFFICIAL_RECIPE_PASSWORD doit contenir au moins 12 caractères',
    );
  }

  const league = await prisma.organization.findUnique({
    where: { code: 'LFPB' },
  });

  if (!league) {
    throw new Error('Organisation LFPB introuvable');
  }

  const dragons = await prisma.organization.findUnique({
    where: { code: 'DRAGONS' },
    include: { club: true },
  });

  const aziza = await prisma.organization.findUnique({
    where: { code: 'AZIZA' },
    include: { club: true },
  });

  if (!dragons?.club || !aziza?.club) {
    throw new Error(
      'Clubs DRAGONS/AZIZA introuvables. Lancez d’abord le seed professionnel E2E.',
    );
  }

  const competition = await prisma.competition.findFirst({
    where: { code: 'L1-TEST-MATCH-SHEET' },
  });

  if (!competition) {
    throw new Error(
      'Compétition L1-TEST-MATCH-SHEET introuvable. Lancez d’abord le seed professionnel E2E.',
    );
  }

  const match = await prisma.match.findFirst({
    where: {
      competitionId: competition.id,
      homeClubId: dragons.club.id,
      awayClubId: aziza.club.id,
      kickoffAt: TARGET_KICKOFF,
    },
    include: {
      matchSheet: true,
      homeClub: {
        include: { organization: true },
      },
      awayClub: {
        include: { organization: true },
      },
    },
  });

  if (!match) {
    throw new Error(
      'Match de recette professionnel introuvable. Lancez d’abord db:seed:professional-match-e2e.',
    );
  }

  if (!match.matchSheet) {
    throw new Error(
      'La feuille de match de recette est absente. Lancez d’abord db:seed:professional-match-e2e.',
    );
  }

  const adminMembership = await prisma.membership.findFirst({
    where: {
      organizationId: league.id,
      role: Role.LIGUE_ADMIN,
      status: 'ACTIVE',
    },
  });

  if (!adminMembership) {
    throw new Error(
      'Aucun administrateur Ligue actif disponible pour créer les désignations.',
    );
  }

  await prisma.matchOfficialAssignment.deleteMany({
    where: {
      matchId: match.id,
    },
  });

  console.info(
    '✅ Anciennes désignations du match de recette supprimées',
  );

  const passwordHash = await hash(password, 12);

  const prepared: Array<{
    email: string;
    label: string;
    role: MatchOfficialRole;
    assignmentId: string;
  }> = [];

  for (const recipe of OFFICIALS) {
    const official = await ensureOfficial(
      league.id,
      recipe,
      passwordHash,
    );

    const assignment = await assignOfficial(
      match.id,
      official.registrationId,
      recipe.role,
      adminMembership.userId,
    );

    prepared.push({
      email: recipe.email,
      label: recipe.label,
      role: recipe.role,
      assignmentId: assignment.id,
    });
  }

  const assignments =
    await prisma.matchOfficialAssignment.findMany({
      where: {
        matchId: match.id,
        status: MatchOfficialAssignmentStatus.ACCEPTED,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        role: true,
        status: true,
        officialProfile: {
          select: {
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
    });

  console.info('');
  console.info('✅ RECETTE OFFICIEL DIGITAL FOOT PRÊTE');
  console.info('');
  console.info(`MATCH_ID=${match.id}`);
  console.info(
    `MATCH=${match.homeClub.organization.name} - ${match.awayClub.organization.name}`,
  );
  console.info(`KICKOFF=${match.kickoffAt?.toISOString() ?? '—'}`);
  console.info(`MATCH_STATUS=${match.status}`);
  console.info(`SHEET_STATUS=${match.matchSheet.status}`);
  console.info('');
  console.info(`PASSWORD=${password}`);
  console.info('');

  for (const item of prepared) {
    console.info(`${item.label}`);
    console.info(`  ${item.email}`);
    console.info(`  ${item.role}`);
  }

  console.info('');
  console.info(
    `DESIGNATIONS_ACCEPTEES=${assignments.length}`,
  );

  for (const assignment of assignments) {
    console.info(
      `  ${assignment.role} | ${assignment.officialProfile.user?.email ?? 'sans compte'} | ${assignment.status}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error('');
    console.error('❌ Seed recette Officiel échoué');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
