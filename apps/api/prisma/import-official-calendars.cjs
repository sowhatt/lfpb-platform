const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

const leagueArg = process.argv.find(
  (arg) => arg.startsWith('--league=')
);

const TARGET_LEAGUE = leagueArg
  ? leagueArg.split('=')[1].toUpperCase()
  : null;

if (
  TARGET_LEAGUE &&
  !['L1', 'L2'].includes(TARGET_LEAGUE)
) {
  throw new Error(
    'Utiliser --league=L1 ou --league=L2'
  );
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function loadJson(repoRoot, league) {
  return JSON.parse(
    fs.readFileSync(
      path.join(
        repoRoot,
        'docs',
        'calendriers',
        'structured',
        `${league}-2026-2027.json`,
      ),
      'utf8',
    ),
  );
}

function loadOverrides(repoRoot, league) {
  const file = path.join(
    repoRoot,
    'docs',
    'calendriers',
    'corrections',
    `${league}-2026-2027-overrides.json`,
  );

  if (!fs.existsSync(file)) {
    return [];
  }

  const data = JSON.parse(
    fs.readFileSync(file, 'utf8'),
  );

  return Array.isArray(data.overrides)
    ? data.overrides
    : [];
}

function applyOverrides(calendar, overrides) {
  if (!overrides.length) {
    return calendar;
  }

  const clone = JSON.parse(
    JSON.stringify(calendar),
  );

  const overrideMap = new Map(
    overrides.map((item) => [
      item.matchNumber,
      item,
    ]),
  );

  for (const row of clone.rows) {
    const override =
      overrideMap.get(row.matchNumber);

    if (!override) {
      continue;
    }

    if (
      override.sourceDate &&
      row.date !== override.sourceDate
    ) {
      throw new Error(
        `${row.matchNumber}: sourceDate ${override.sourceDate} ne correspond pas à ${row.date}`,
      );
    }

    if (!override.correctedDate) {
      continue;
    }

    row.source = row.source ?? {};
    row.source.originalDate = row.date;
    row.source.correctedDate =
      override.correctedDate;
    row.source.correctionReason =
      override.reason ?? null;
    row.source.validatedBy =
      override.validatedBy ?? null;
    row.source.validatedAt =
      override.validatedAt ?? null;

    row.date = override.correctedDate;
  }

  const outOfSeason =
    clone.validation?.outOfSeason ?? [];

  clone.validation.outOfSeason =
    outOfSeason.filter((item) => {
      const override =
        overrideMap.get(item.matchNumber);

      return !(
        override &&
        override.correctedDate
      );
    });

  return clone;
}

function kickoff(dateValue, timeValue) {
  const [day, month, year] = dateValue.split('/');

  const m = timeValue.match(/^(\d{2})H(?:(\d{2}))?$/);

  if (!m) {
    throw new Error(`Heure invalide : ${timeValue}`);
  }

  const hour = m[1];
  const minute = m[2] ?? '00';

  return new Date(
    `${year}-${month}-${day}T${hour}:${minute}:00+01:00`,
  );
}

async function resolveCompetition(code) {
  return prisma.competition.findFirst({
    where: { code },
    include: {
      entries: {
        where: { active: true },
        include: {
          club: {
            include: {
              organization: true,
            },
          },
        },
      },
      rounds: true,
      matches: true,
    },
  });
}

function buildClubIndex(competition) {
  const index = new Map();

  for (const entry of competition.entries) {
    const club = entry.club;

    for (const alias of [
      club.organization.name,
      club.shortName,
      club.organization.code,
    ].filter(Boolean)) {
      index.set(normalize(alias), club);
    }
  }

  const explicitAliases = {
    'AZIZA FC': ['AZIZA', 'RC AZIZA', 'RC AZIZA FC'],
    'BEKE FC': ['BEKE', 'BEKE FC'],
    'REQUINS FC': ['REQUINS', 'REQUINS FC'],
    'DRAGONS FC': ['DRAGONS', 'DRAGONS FC DE L OUEME'],
  };

  for (const [source, aliases] of Object.entries(explicitAliases)) {
    for (const alias of aliases) {
      const found = index.get(normalize(alias));

      if (found) {
        index.set(normalize(source), found);
        break;
      }
    }
  }

  return index;
}

async function buildVenueIndex() {
  const venues = await prisma.venue.findMany({
    where: { active: true },
  });

  const index = new Map();

  for (const venue of venues) {
    index.set(normalize(venue.name), venue);
  }

  return index;
}

function validateCalendar(calendar, leagueName) {
  const errors = [];

  if (calendar.rows.length !== 306) {
    errors.push(`${leagueName}: ${calendar.rows.length} matchs au lieu de 306`);
  }

  if (calendar.clubs.length !== 18) {
    errors.push(`${leagueName}: ${calendar.clubs.length} clubs au lieu de 18`);
  }

  if (calendar.validation.missingNumbers?.length) {
    errors.push(
      `${leagueName}: numéros manquants ${calendar.validation.missingNumbers.join(', ')}`,
    );
  }

  if (calendar.validation.missingFields?.length) {
    errors.push(
      `${leagueName}: champs manquants ${calendar.validation.missingFields.join(', ')}`,
    );
  }

  return errors;
}

async function prepareLeague({
  key,
  code,
  calendar,
  venueIndex,
}) {
  const competition = await resolveCompetition(code);

  if (!competition) {
    throw new Error(`Compétition ${code} introuvable`);
  }

  const clubIndex = buildClubIndex(competition);

  const unresolvedClubs = new Set();
  const unresolvedVenues = new Set();

  for (const row of calendar.rows) {
    if (!clubIndex.get(normalize(row.homeClub))) {
      unresolvedClubs.add(row.homeClub);
    }

    if (!clubIndex.get(normalize(row.awayClub))) {
      unresolvedClubs.add(row.awayClub);
    }

    if (!venueIndex.get(normalize(row.venue))) {
      unresolvedVenues.add(row.venue);
    }
  }

  const nonOfficialMatches = competition.matches.filter(
    (m) => !m.officialMatchNumber,
  );

  const officialMatches = competition.matches.filter(
    (m) => m.officialMatchNumber,
  );

  const outOfSeason =
    calendar.validation?.outOfSeason ?? [];

  console.log(`\n========== ${key} ==========`);

  console.log('Compétition          :', competition.name);
  console.log('Matchs source         :', calendar.rows.length);
  console.log('Clubs source          :', calendar.clubs.length);
  console.log('Clubs DB actifs       :', competition.entries.length);
  console.log('Clubs non résolus     :', unresolvedClubs.size);
  console.log('Stades non résolus    :', unresolvedVenues.size);
  console.log('Journées existantes   :', competition.rounds.length);
  console.log('Matchs non officiels  :', nonOfficialMatches.length);
  console.log('Matchs officiels DB   :', officialMatches.length);

  if (unresolvedClubs.size) {
    console.log(
      'Clubs problématiques :',
      [...unresolvedClubs].join(', '),
    );
  }

  if (unresolvedVenues.size) {
    console.log(
      'Stades problématiques:',
      [...unresolvedVenues].join(', '),
    );
  }

  if (outOfSeason.length) {
    console.log('\nANOMALIES HORS SAISON');

    for (const row of outOfSeason) {
      console.log(
        `${row.matchNumber} | ${row.date} | ` +
        `${row.homeClub} - ${row.awayClub} | ${row.venue}`,
      );
    }
  }

  return {
    key,
    code,
    competition,
    calendar,
    clubIndex,
    venueIndex,
    nonOfficialMatches,
    unresolvedClubs,
    unresolvedVenues,
    outOfSeason,
  };
}

async function applyLeague(plan) {
  const {
    competition,
    calendar,
    clubIndex,
    venueIndex,
    nonOfficialMatches,
  } = plan;

  await prisma.$transaction(
    async (tx) => {
      if (nonOfficialMatches.length) {
        const ids = nonOfficialMatches.map((m) => m.id);

        await tx.match.deleteMany({
          where: {
            id: { in: ids },
            officialMatchNumber: null,
          },
        });
      }

      const rounds = new Map();

      for (let number = 1; number <= 34; number++) {
        const rows = calendar.rows.filter(
          (r) => r.roundNumber === number,
        );

        const dates = rows
          .map((r) => kickoff(r.date, r.time))
          .sort((a, b) => a - b);

        const round = await tx.competitionRound.upsert({
          where: {
            competitionId_number: {
              competitionId: competition.id,
              number,
            },
          },
          update: {
            name: `${number}ème Journée`,
            startDate: dates[0],
            endDate: dates[dates.length - 1],
          },
          create: {
            competitionId: competition.id,
            number,
            name: `${number}ème Journée`,
            startDate: dates[0],
            endDate: dates[dates.length - 1],
          },
        });

        rounds.set(number, round);
      }

      for (const row of calendar.rows) {
        const home = clubIndex.get(
          normalize(row.homeClub),
        );

        const away = clubIndex.get(
          normalize(row.awayClub),
        );

        const venue = venueIndex.get(
          normalize(row.venue),
        );

        const round = rounds.get(
          row.roundNumber,
        );

        if (!home || !away || !venue || !round) {
          throw new Error(
            `Référence non résolue pour ${row.matchNumber}`,
          );
        }

        const existing = await tx.match.findUnique({
          where: {
            competitionId_officialMatchNumber: {
              competitionId: competition.id,
              officialMatchNumber: row.matchNumber,
            },
          },
        });

        const data = {
          roundId: round.id,
          venueId: venue.id,
          homeClubId: home.id,
          awayClubId: away.id,
          kickoffAt: kickoff(row.date, row.time),
          status: 'SCHEDULED',
        };

        if (existing) {
          const protectedMatch =
            existing.status === 'IN_PROGRESS' ||
            existing.status === 'COMPLETED' ||
            existing.homologationStatus !== null;

          if (protectedMatch) {
            throw new Error(
              `${row.matchNumber} est déjà protégé et ne peut pas être écrasé`,
            );
          }

          const identityChanged =
            existing.roundId !== round.id ||
            existing.homeClubId !== home.id ||
            existing.awayClubId !== away.id;

          if (identityChanged) {
            throw new Error(
              `${row.matchNumber} existe avec une identité différente`,
            );
          }

          await tx.match.update({
            where: { id: existing.id },
            data,
          });
        } else {
          await tx.match.create({
            data: {
              competitionId: competition.id,
              officialMatchNumber: row.matchNumber,
              ...data,
            },
          });
        }
      }
    },
    {
      timeout: 120000,
    },
  );
}

async function main() {
  const repoRoot = path.resolve(__dirname, '../../..');

  const l1 = applyOverrides(
    loadJson(repoRoot, 'ligue1'),
    loadOverrides(repoRoot, 'ligue1'),
  );

  const l2 = applyOverrides(
    loadJson(repoRoot, 'ligue2'),
    loadOverrides(repoRoot, 'ligue2'),
  );

  const structuralErrors = [
    ...validateCalendar(l1, 'Ligue 1'),
    ...validateCalendar(l2, 'Ligue 2'),
  ];

  if (structuralErrors.length) {
    console.error('\nERREURS STRUCTURELLES');

    for (const error of structuralErrors) {
      console.error(' -', error);
    }

    process.exitCode = 1;
    return;
  }

  const venueIndex = await buildVenueIndex();

  const plans = [];

  if (!TARGET_LEAGUE || TARGET_LEAGUE === 'L1') {
    plans.push(
      await prepareLeague({
        key: 'LIGUE 1',
        code: 'L1-2026-2027',
        calendar: l1,
        venueIndex,
      }),
    );
  }

  if (!TARGET_LEAGUE || TARGET_LEAGUE === 'L2') {
    plans.push(
      await prepareLeague({
        key: 'LIGUE 2',
        code: 'L2-2026-2027',
        calendar: l2,
        venueIndex,
      }),
    );
  }

  const referenceErrors = plans.some(
    (p) =>
      p.unresolvedClubs.size > 0 ||
      p.unresolvedVenues.size > 0,
  );

  if (referenceErrors) {
    console.log(
      '\nIMPORT BLOQUE : référentiels non résolus.',
    );
    process.exitCode = 2;
    return;
  }

  const outOfSeasonPlans = plans.filter(
    (p) => p.outOfSeason.length > 0,
  );

  console.log('\n========== PLAN ==========');

  for (const plan of plans) {
    console.log(
      `${plan.key} : ` +
      `${plan.nonOfficialMatches.length} ancien(s) match(s) à retirer, ` +
      `34 journées à garantir, ` +
      `${plan.calendar.rows.length} matchs officiels à synchroniser`,
    );
  }

  if (outOfSeasonPlans.length) {
    console.log(
      '\nIMPORT COMPLET BLOQUE PAR UNE ANOMALIE OFFICIELLE :',
    );

    for (const plan of outOfSeasonPlans) {
      for (const row of plan.outOfSeason) {
        console.log(
          `${plan.key} ${row.matchNumber} -> ${row.date}`,
        );
      }
    }
  }

  if (!APPLY) {
    console.log(
      '\nDRY-RUN TERMINE : aucune donnée modifiée.',
    );

    console.log(
      'Le mode --apply restera bloqué tant qu’une date hors saison subsiste.',
    );

    return;
  }

  if (outOfSeasonPlans.length) {
    throw new Error(
      'Import refusé : corriger/valider les anomalies hors saison avant --apply.',
    );
  }

  for (const plan of plans) {
    await applyLeague(plan);
    console.log(`${plan.key} importée avec succès.`);
  }

  console.log('\nIMPORT OFFICIEL TERMINE.');
}

main()
  .catch((error) => {
    console.error('\nERREUR IMPORT');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
