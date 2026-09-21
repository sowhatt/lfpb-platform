const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const competition = await prisma.competition.findFirst({
    where: { code: 'L1-2026-2027' },
    include: {
      rounds: {
        orderBy: { number: 'asc' },
        include: {
          _count: {
            select: { matches: true },
          },
        },
      },
      matches: {
        select: {
          id: true,
          officialMatchNumber: true,
          roundId: true,
          kickoffAt: true,
          status: true,
        },
      },
    },
  });

  if (!competition) {
    throw new Error('L1-2026-2027 introuvable');
  }

  const official = competition.matches.filter(
    (m) => m.officialMatchNumber !== null,
  );

  const nonOfficial = competition.matches.filter(
    (m) => m.officialMatchNumber === null,
  );

  const numbers = official
    .map((m) => m.officialMatchNumber)
    .filter(Boolean)
    .sort();

  const uniqueNumbers = new Set(numbers);

  const badRounds = competition.rounds.filter(
    (r) => r._count.matches !== 9,
  );

  const expectedNumbers = Array.from(
    { length: 306 },
    (_, i) => `CL${String(i + 1).padStart(3, '0')}`,
  );

  const missingNumbers = expectedNumbers.filter(
    (n) => !uniqueNumbers.has(n),
  );

  const unexpectedNumbers = numbers.filter(
    (n) => !expectedNumbers.includes(n),
  );

  console.log('\n========== VERIFICATION LIGUE 1 ==========');
  console.log('Journées             :', competition.rounds.length);
  console.log('Matchs total          :', competition.matches.length);
  console.log('Matchs officiels      :', official.length);
  console.log('Matchs sans numéro    :', nonOfficial.length);
  console.log('Numéros uniques       :', uniqueNumbers.size);
  console.log('Premier numéro        :', numbers[0] ?? '-');
  console.log('Dernier numéro        :', numbers.at(-1) ?? '-');
  console.log('Numéros manquants     :', missingNumbers.length);
  console.log('Numéros inattendus    :', unexpectedNumbers.length);
  console.log('Journées != 9 matchs  :', badRounds.length);

  if (missingNumbers.length) {
    console.log('Manquants :', missingNumbers);
  }

  if (unexpectedNumbers.length) {
    console.log('Inattendus :', unexpectedNumbers);
  }

  if (badRounds.length) {
    for (const round of badRounds) {
      console.log(
        `J${round.number} : ${round._count.matches} matchs`,
      );
    }
  }

  const ok =
    competition.rounds.length === 34 &&
    competition.matches.length === 306 &&
    official.length === 306 &&
    nonOfficial.length === 0 &&
    uniqueNumbers.size === 306 &&
    numbers[0] === 'CL001' &&
    numbers.at(-1) === 'CL306' &&
    missingNumbers.length === 0 &&
    unexpectedNumbers.length === 0 &&
    badRounds.length === 0;

  console.log(
    '\nRESULTAT :',
    ok
      ? 'OK - LIGUE 1 OFFICIELLE COMPLETE'
      : 'ECHEC - CONTROLE A ANALYSER',
  );

  if (!ok) {
    process.exitCode = 2;
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
