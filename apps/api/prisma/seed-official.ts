import {
  OfficialFunction,
  RegistrationCategory,
  RegistrationStatus,
  Role,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = (
    process.env.SEED_OFFICIAL_EMAIL ?? "arbitre.pilote@lfpb.bj"
  ).toLowerCase();

  const password = process.env.SEED_OFFICIAL_PASSWORD;

  if (!password || password.length < 12) {
    throw new Error(
      "SEED_OFFICIAL_PASSWORD doit contenir au moins 12 caractères",
    );
  }

  const league = await prisma.organization.findUnique({
    where: { code: "LFPB" },
  });

  if (!league) {
    throw new Error("Organisation LFPB introuvable");
  }

  const passwordHash = await hash(password, 12);

  const official = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      active: true,
    },
    create: {
      email,
      passwordHash,
      firstName: "Arbitre",
      lastName: "Pilote",
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

  const existingProfile = await prisma.officialProfile.findUnique({
    where: {
      userId: official.id,
    },
  });

  if (existingProfile) {
    await prisma.officialProfile.update({
      where: {
        registrationId: existingProfile.registrationId,
      },
      data: {
        function: OfficialFunction.REFEREE,
        grade: "Fédéral",
      },
    });

    console.info(`✅ Profil officiel existant réutilisé : ${email}`);
    return;
  }

  const person = await prisma.person.upsert({
    where: {
      federationId: "PILOT-OFFICIAL-001",
    },
    update: {
      firstName: "Arbitre",
      lastName: "Pilote",
    },
    create: {
      firstName: "Arbitre",
      lastName: "Pilote",
      birthDate: new Date("1990-01-01T00:00:00.000Z"),
      nationality: "Béninoise",
      federationId: "PILOT-OFFICIAL-001",
    },
  });

  const registration = await prisma.registration.upsert({
    where: {
      deduplicationKey: "seed:official:pilot-001",
    },
    update: {
      status: RegistrationStatus.VALIDATED,
    },
    create: {
      personId: person.id,
      organizationId: league.id,
      category: RegistrationCategory.OFFICIAL,
      deduplicationKey: "seed:official:pilot-001",
      status: RegistrationStatus.VALIDATED,
      startDate: new Date("2026-08-01T00:00:00.000Z"),
    },
  });

  await prisma.officialProfile.create({
    data: {
      registrationId: registration.id,
      userId: official.id,
      function: OfficialFunction.REFEREE,
      grade: "Fédéral",
    },
  });

  console.info(`✅ Nouveau profil officiel créé : ${email}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
