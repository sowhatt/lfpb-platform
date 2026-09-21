import {
  CompetitionFormat,
  CompetitionStatus,
  Division,
  OrganizationType,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

type ClubDefinition = {
  code: string;
  shortName: string;
  organizationName: string;
  division: Division;
  existingCode?: string;
};

const L1: ClubDefinition[] = [
  { code: 'BANI-GANSE', shortName: 'BANI GANSE FC', organizationName: 'BANI GANSE FC', division: Division.LIGUE_1 },
  { code: 'SOBEMAP', shortName: 'SOBEMAP FC', organizationName: 'SOBEMAP FC', division: Division.LIGUE_1 },
  { code: 'ASVO', shortName: 'ASVO FC', organizationName: 'ASVO FC', division: Division.LIGUE_1 },
  { code: 'USS-KRAKE', shortName: 'USS KRAKE FC', organizationName: 'USS KRAKE FC', division: Division.LIGUE_1 },
  { code: 'DRAGONS', shortName: 'Dragons FC', organizationName: 'Dragons FC de l’Ouémé', division: Division.LIGUE_1, existingCode: 'DRAGONS' },
  { code: 'COTON', shortName: 'COTON FC', organizationName: 'COTON FC', division: Division.LIGUE_1 },
  { code: 'ESPOIR', shortName: 'ESPOIR FC', organizationName: 'ESPOIR FC', division: Division.LIGUE_1 },
  { code: 'ASPAC', shortName: 'ASPAC FC', organizationName: 'ASPAC FC', division: Division.LIGUE_1 },
  { code: 'DYNAMO-AB', shortName: 'DYNAMO FC AB', organizationName: 'DYNAMO FC AB', division: Division.LIGUE_1 },
  { code: 'LOTO-POPO', shortName: 'LOTO POPO FC', organizationName: 'LOTO POPO FC', division: Division.LIGUE_1 },
  { code: 'HODIO', shortName: 'HODIO FC', organizationName: 'HODIO FC', division: Division.LIGUE_1 },
  { code: 'AS-COTONOU', shortName: 'AS COTONOU FC', organizationName: 'AS COTONOU FC', division: Division.LIGUE_1 },
  { code: 'DJEFFA', shortName: 'DJEFFA FC', organizationName: 'DJEFFA FC', division: Division.LIGUE_1 },
  { code: 'PANTHERES', shortName: 'PANTHERES FC', organizationName: 'PANTHERES FC', division: Division.LIGUE_1 },
  { code: 'BUFFLES', shortName: 'BUFFLES FC', organizationName: 'BUFFLES FC', division: Division.LIGUE_1 },
  { code: 'AYEMA', shortName: 'AYEMA FC', organizationName: 'AYEMA FC', division: Division.LIGUE_1 },
  { code: 'DAMISSA', shortName: 'DAMISSA FC', organizationName: 'DAMISSA FC', division: Division.LIGUE_1 },
  { code: 'CAVALIERS', shortName: 'CAVALIERS FC', organizationName: 'CAVALIERS FC', division: Division.LIGUE_1 },
];

const L2: ClubDefinition[] = [
  { code: 'TAKUNNIN', shortName: 'TAKUNNIN FC', organizationName: 'TAKUNNIN FC', division: Division.LIGUE_2 },
  { code: 'SITATUNGA', shortName: 'SITATUNGA FC', organizationName: 'SITATUNGA FC', division: Division.LIGUE_2 },
  { code: 'AS-ETALONS', shortName: 'AS ETALONS FC', organizationName: 'AS ETALONS FC', division: Division.LIGUE_2 },
  { code: 'BOA', shortName: 'BOA FC', organizationName: 'BOA FC', division: Division.LIGUE_2 },
  { code: 'AS-ELITE', shortName: 'AS ELITE FC', organizationName: 'AS ELITE FC', division: Division.LIGUE_2 },
  { code: 'REAL-SPORT', shortName: 'REAL SPORT FC', organizationName: 'REAL SPORT FC', division: Division.LIGUE_2 },
  { code: 'AS-POLICE', shortName: 'AS POLICE FC', organizationName: 'AS POLICE FC', division: Division.LIGUE_2 },
  { code: 'JSP', shortName: 'JSP FC', organizationName: 'JSP FC', division: Division.LIGUE_2 },
  { code: 'JAK', shortName: 'JAK FC', organizationName: 'JAK FC', division: Division.LIGUE_2 },
  { code: 'ENERGIE', shortName: 'ENERGIE FC', organizationName: 'ENERGIE FC', division: Division.LIGUE_2 },
  { code: 'ADJIDJA', shortName: 'ADJIDJA FC', organizationName: 'ADJIDJA FC', division: Division.LIGUE_2 },
  { code: 'AVRANKOU-OMN', shortName: 'AVRANKOU OMN FC', organizationName: 'AVRANKOU OMN FC', division: Division.LIGUE_2 },
  { code: 'AZIZA', shortName: 'AZIZA FC', organizationName: 'RC Aziza FC', division: Division.LIGUE_2, existingCode: 'AZIZA' },
  { code: 'BEKE', shortName: 'Béké FC', organizationName: 'Béké FC', division: Division.LIGUE_2, existingCode: 'BEKE' },
  { code: 'ABEILLES', shortName: 'ABEILLES FC', organizationName: 'ABEILLES FC', division: Division.LIGUE_2 },
  { code: 'DADJE', shortName: 'DADJE FC', organizationName: 'DADJE FC', division: Division.LIGUE_2 },
  { code: 'REQUINS', shortName: 'Requins FC', organizationName: 'Requins FC de l’Atlantique', division: Division.LIGUE_2, existingCode: 'REQUINS' },
  { code: 'OKUTA', shortName: 'OKUTA FC', organizationName: 'OKUTA FC', division: Division.LIGUE_2 },
];

const VENUES = [
  'BANIKOARA',
  'ADJOHOUN',
  'AVRANKOU',
  'SAVALOU',
  'ABOMEY',
  'COME',
  'DOGBO',
  'NIKKI',
  'BEMBEREKE',
  'POBE',
  'TOFFO',
  'GRAND POPO',
  'OUIDAH',
  'DJOUGOU',
  'KANDI',
  'DJAKOTOME',
  'DJAKOTOMEY',
  'KETOU',
  'COVE',
  'OUESSE',
  'APLAHOUE',
];

async function ensureClub(definition: ClubDefinition) {
  const code = definition.existingCode ?? definition.code;

  const organization = await prisma.organization.upsert({
    where: { code },
    update: {
      active: true,
      type: OrganizationType.CLUB,
    },
    create: {
      code,
      name: definition.organizationName,
      type: OrganizationType.CLUB,
      active: true,
    },
    include: { club: true },
  });

  if (organization.club) {
    return organization.club;
  }

  return prisma.club.create({
    data: {
      organizationId: organization.id,
      shortName: definition.shortName,
      division: definition.division,
    },
  });
}

async function main() {
  const league = await prisma.organization.findUniqueOrThrow({
    where: { code: 'LFPB' },
  });

  const season = await prisma.season.findFirstOrThrow({
    where: { name: '2026-2027' },
  });

  const l1 = await prisma.competition.upsert({
    where: {
      seasonId_code: {
        seasonId: season.id,
        code: 'L1-2026-2027',
      },
    },
    update: {
      name: 'Championnat professionnel Ligue 1',
      division: Division.LIGUE_1,
      format: CompetitionFormat.DOUBLE_ROUND_ROBIN,
      status: CompetitionStatus.PUBLISHED,
    },
    create: {
      organizationId: league.id,
      seasonId: season.id,
      name: 'Championnat professionnel Ligue 1',
      code: 'L1-2026-2027',
      division: Division.LIGUE_1,
      format: CompetitionFormat.DOUBLE_ROUND_ROBIN,
      status: CompetitionStatus.PUBLISHED,
    },
  });

  const l2 = await prisma.competition.upsert({
    where: {
      seasonId_code: {
        seasonId: season.id,
        code: 'L2-2026-2027',
      },
    },
    update: {
      name: 'Championnat professionnel Ligue 2',
      division: Division.LIGUE_2,
      format: CompetitionFormat.DOUBLE_ROUND_ROBIN,
      status: CompetitionStatus.PUBLISHED,
    },
    create: {
      organizationId: league.id,
      seasonId: season.id,
      name: 'Championnat professionnel Ligue 2',
      code: 'L2-2026-2027',
      division: Division.LIGUE_2,
      format: CompetitionFormat.DOUBLE_ROUND_ROBIN,
      status: CompetitionStatus.PUBLISHED,
    },
  });

  const l1Ids: string[] = [];
  const l2Ids: string[] = [];

  for (const definition of L1) {
    const club = await ensureClub(definition);
    l1Ids.push(club.id);

    await prisma.competitionClub.upsert({
      where: {
        competitionId_clubId: {
          competitionId: l1.id,
          clubId: club.id,
        },
      },
      update: { active: true },
      create: {
        competitionId: l1.id,
        clubId: club.id,
        active: true,
      },
    });
  }

  for (const definition of L2) {
    const club = await ensureClub(definition);
    l2Ids.push(club.id);

    await prisma.competitionClub.upsert({
      where: {
        competitionId_clubId: {
          competitionId: l2.id,
          clubId: club.id,
        },
      },
      update: { active: true },
      create: {
        competitionId: l2.id,
        clubId: club.id,
        active: true,
      },
    });
  }

  await prisma.competitionClub.updateMany({
    where: {
      competitionId: l1.id,
      clubId: { notIn: l1Ids },
    },
    data: { active: false },
  });

  await prisma.competitionClub.updateMany({
    where: {
      competitionId: l2.id,
      clubId: { notIn: l2Ids },
    },
    data: { active: false },
  });

  for (const label of VENUES) {
    await prisma.venue.upsert({
      where: {
        name_city: {
          name: label,
          city: label,
        },
      },
      update: {
        active: true,
        approved: true,
      },
      create: {
        name: label,
        city: label,
        active: true,
        approved: true,
      },
    });
  }

  const l1Count = await prisma.competitionClub.count({
    where: { competitionId: l1.id, active: true },
  });

  const l2Count = await prisma.competitionClub.count({
    where: { competitionId: l2.id, active: true },
  });

  console.log(`Ligue 1 officielle : ${l1Count} clubs`);
  console.log(`Ligue 2 officielle : ${l2Count} clubs`);
  console.log(`Stades officiels préparés : ${VENUES.length}`);

  if (l1Count !== 18 || l2Count !== 18) {
    throw new Error(
      `Référentiel invalide : L1=${l1Count}, L2=${l2Count}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
