const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');

const prisma = new PrismaClient();

async function main() {
  const competition = await prisma.competition.findFirst({
    where: { code: 'L1-2026-2027' },
  });

  if (!competition) {
    throw new Error('L1-2026-2027 introuvable');
  }

  const matches = await prisma.match.findMany({
    where: {
      competitionId: competition.id,
      officialMatchNumber: null,
    },
    include: {
      round: true,
      venue: true,
      homeClub: {
        include: { organization: true },
      },
      awayClub: {
        include: { organization: true },
      },
    },
    orderBy: {
      kickoffAt: 'asc',
    },
  });

  const output = path.resolve(
    __dirname,
    '../../../docs/calendriers/backups/l1-old-test-matches-before-official-import.json',
  );

  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        competitionId: competition.id,
        competitionCode: competition.code,
        count: matches.length,
        matches,
      },
      null,
      2,
    ),
  );

  console.log(`Sauvegarde créée : ${output}`);
  console.log(`Matchs sauvegardés : ${matches.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
