import {
  Division,
  OfficialFunction,
  OrganizationType,
  RegistrationCategory,
  RegistrationStatus,
  Role,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

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
  const adminEmail = (
    process.env.SEED_ADMIN_EMAIL ?? "admin@lfpb.bj"
  ).toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const clubEmail = (
    process.env.SEED_CLUB_EMAIL ?? "admin@dragons.bj"
  ).toLowerCase();
  const clubPassword = process.env.SEED_CLUB_PASSWORD;
  const managerEmail = (
    process.env.SEED_COMPETITION_MANAGER_EMAIL ?? "competitions@lfpb.bj"
  ).toLowerCase();
  const managerPassword = process.env.SEED_COMPETITION_MANAGER_PASSWORD;
  const approverEmail = (
    process.env.SEED_SCHEDULE_APPROVER_EMAIL ?? "validation.calendrier@lfpb.bj"
  ).toLowerCase();
  const approverPassword = process.env.SEED_SCHEDULE_APPROVER_PASSWORD;
  const officialEmail = (
    process.env.SEED_OFFICIAL_EMAIL ?? "arbitre.demo@lfpb.bj"
  ).toLowerCase();
  const officialPassword = process.env.SEED_OFFICIAL_PASSWORD;
  const federationEmail = (
    process.env.SEED_FEDERATION_EMAIL ?? "licences@febefoot.bj"
  ).toLowerCase();
  const federationPassword = process.env.SEED_FEDERATION_PASSWORD;

  if (!adminPassword || adminPassword.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD doit contenir au moins 12 caractères");
  }
  if (!clubPassword || clubPassword.length < 12) {
    throw new Error("SEED_CLUB_PASSWORD doit contenir au moins 12 caractères");
  }
  if (!managerPassword || managerPassword.length < 12) {
    throw new Error(
      "SEED_COMPETITION_MANAGER_PASSWORD doit contenir au moins 12 caractères",
    );
  }
  if (!approverPassword || approverPassword.length < 12) {
    throw new Error(
      "SEED_SCHEDULE_APPROVER_PASSWORD doit contenir au moins 12 caractères",
    );
  }
  if (!officialPassword || officialPassword.length < 12) {
    throw new Error(
      "SEED_OFFICIAL_PASSWORD doit contenir au moins 12 caractères",
    );
  }
  if (!federationPassword || federationPassword.length < 12) {
    throw new Error(
      "SEED_FEDERATION_PASSWORD doit contenir au moins 12 caractères",
    );
  }

  const league = await prisma.organization.upsert({
    where: { code: "LFPB" },
    update: {},
    create: {
      name: "Ligue de Football Professionnel du Bénin",
      code: "LFPB",
      type: OrganizationType.LEAGUE,
    },
  });

  const federation = await prisma.organization.upsert({
    where: { code: "FBF" },
    update: {},
    create: {
      name: "Fédération Béninoise de Football",
      code: "FBF",
      type: OrganizationType.FEDERATION,
    },
  });

  const clubs = new Map<string, string>();
  for (const club of [
    {
      name: "Dragons FC de l’Ouémé",
      code: "DRAGONS",
      shortName: "Dragons FC",
      division: Division.LIGUE_1,
      city: "Porto-Novo",
    },
    {
      name: "RC Aziza FC",
      code: "AZIZA",
      shortName: "RC Aziza",
      division: Division.LIGUE_1,
      city: "Cotonou",
    },
    {
      name: "Béké FC",
      code: "BEKE",
      shortName: "Béké FC",
      division: Division.LIGUE_1,
      city: "Bembèrèkè",
    },
  ]) {
    const organization = await prisma.organization.upsert({
      where: { code: club.code },
      update: {},
      create: {
        name: club.name,
        code: club.code,
        type: OrganizationType.CLUB,
        club: {
          create: {
            shortName: club.shortName,
            division: club.division,
            city: club.city,
          },
        },
      },
    });
    clubs.set(club.code, organization.id);
  }

  const leagueAdmin = await upsertUser(
    adminEmail,
    adminPassword,
    "Administrateur",
    "LFPB",
  );
  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: leagueAdmin.id,
        organizationId: league.id,
        role: Role.LIGUE_ADMIN,
      },
    },
    update: {},
    create: {
      userId: leagueAdmin.id,
      organizationId: league.id,
      role: Role.LIGUE_ADMIN,
    },
  });

  const official = await upsertUser(
    officialEmail,
    officialPassword,
    "Arbitre",
    "Démonstration",
  );
  const officialPerson = await prisma.person.upsert({
    where: { federationId: "DEMO-OFFICIAL-001" },
    update: { firstName: "Arbitre", lastName: "Démonstration" },
    create: {
      firstName: "Arbitre",
      lastName: "Démonstration",
      birthDate: new Date("1990-01-01T00:00:00.000Z"),
      nationality: "Béninoise",
      federationId: "DEMO-OFFICIAL-001",
    },
  });
  const officialRegistration = await prisma.registration.upsert({
    where: { deduplicationKey: "seed:official:demo-001" },
    update: { status: RegistrationStatus.VALIDATED },
    create: {
      personId: officialPerson.id,
      organizationId: league.id,
      category: RegistrationCategory.OFFICIAL,
      deduplicationKey: "seed:official:demo-001",
      status: RegistrationStatus.VALIDATED,
      startDate: new Date("2026-08-01T00:00:00.000Z"),
    },
  });
  await prisma.officialProfile.upsert({
    where: { registrationId: officialRegistration.id },
    update: { userId: official.id },
    create: {
      registrationId: officialRegistration.id,
      userId: official.id,
      function: OfficialFunction.REFEREE,
      grade: "Fédéral",
    },
  });

  const federationAgent = await upsertUser(
    federationEmail,
    federationPassword,
    "Agent",
    "Licences FBF",
  );
  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: federationAgent.id,
        organizationId: federation.id,
        role: Role.FEDERATION_AGENT,
      },
    },
    update: {},
    create: {
      userId: federationAgent.id,
      organizationId: federation.id,
      role: Role.FEDERATION_AGENT,
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: official.id,
        organizationId: league.id,
        role: Role.OFFICIEL,
      },
    },
    update: {},
    create: {
      userId: official.id,
      organizationId: league.id,
      role: Role.OFFICIEL,
    },
  });

  const competitionManager = await upsertUser(
    managerEmail,
    managerPassword,
    "Responsable",
    "Compétitions",
  );
  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: competitionManager.id,
        organizationId: league.id,
        role: Role.COMPETITION_MANAGER,
      },
    },
    update: {},
    create: {
      userId: competitionManager.id,
      organizationId: league.id,
      role: Role.COMPETITION_MANAGER,
    },
  });

  const scheduleApprover = await upsertUser(
    approverEmail,
    approverPassword,
    "Validateur",
    "Calendrier",
  );
  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: scheduleApprover.id,
        organizationId: league.id,
        role: Role.SCHEDULE_APPROVER,
      },
    },
    update: {},
    create: {
      userId: scheduleApprover.id,
      organizationId: league.id,
      role: Role.SCHEDULE_APPROVER,
    },
  });

  const dragonsId = clubs.get("DRAGONS");
  if (!dragonsId) throw new Error("Organisation DRAGONS introuvable");

  const clubAdmin = await upsertUser(
    clubEmail,
    clubPassword,
    "Administrateur",
    "Dragons",
  );
  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: clubAdmin.id,
        organizationId: dragonsId,
        role: Role.CLUB_ADMIN,
      },
    },
    update: {},
    create: {
      userId: clubAdmin.id,
      organizationId: dragonsId,
      role: Role.CLUB_ADMIN,
    },
  });

  console.info(`Compte Ligue créé : ${adminEmail}`);
  console.info(`Compte Dragons créé : ${clubEmail}`);
  console.info(`Compte responsable compétitions créé : ${managerEmail}`);
  console.info(`Compte validateur calendrier créé : ${approverEmail}`);
  console.info(`Compte officiel créé : ${officialEmail}`);
  console.info(`Compte licences FBF créé : ${federationEmail}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
