const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const competition = await prisma.competition.findFirst({
    where: { code: 'L2-2026-2027' },
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
      },
    },
  });

  if (!competition) {
    throw new Error('L2-2026-2027 introuvable');
  }

  const official = competition.matches.filter(
    (m) => m.officialMatchNumber !== null
  );

  const nonOfficial = competition.matches.filter(
    (m) => m.officialMatchNumber === null
  );

  const numbers = official
    .map((m) => m.officialMatchNumber)
    .filter(Boolean)
    .sort();

  const uniqueNumbers = new Set(numbers);

  const expectedNumbers = Array.from(
    { length: 306 },
    (_, i) => `CL${String(i + 1).padStart(3, '0')}`
  );

  const missingNumbers = expectedNumbers.filter(
    (n) => !uniqueNumbers.has(n)
  );

  const unexpectedNumbers = numbers.filter(
    (n) => !expectedNumbers.includes(n)
  );

  const badRounds = competition.rounds.filter(
    (r) => r._count.matches !== 9
  );

  const cl234 = competition.matches.find(
    (m) => m.officialMatchNumber === 'CL234'
  );

  console.log('\n========== VERIFICATION LIGUE 2 ==========');
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

  console.log('\n========== CL234 ==========');

  if (!cl234) {
    console.log('CL234 INTROUVABLE');
  } else {
    console.log(
      [
        cl234.officialMatchNumber,
        `J${cl234.round?.number ?? '-'}`,
        `${cl234.homeClub.organization.name} - ${cl234.awayClub.organization.name}`,
        `date=${cl234.kickoffAt?.toISOString() ?? '-'}`,
        `stade=${cl234.venue?.name ?? '-'}`,
        `statut=${cl234.status}`,
      ].join(' | ')
    );
  }

  const cl234Correct =
    cl234 &&
    cl234.kickoffAt &&
    cl234.kickoffAt.toISOString().startsWith('2027-04-18');

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
    badRounds.length === 0 &&
    cl234Correct;

  console.log(
    '\nRESULTAT :',
    ok
      ? 'OK - LIGUE 2 OFFICIELLE COMPLETE'
      : 'ECHEC - CONTROLE A ANALYSER'
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
