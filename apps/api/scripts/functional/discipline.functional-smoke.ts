import {
  CompetitionFormat,
  CompetitionStatus,
  Division,
  LicenseStatus,
  MatchStatus,
  RegistrationCategory,
  RegistrationStatus,
  SeasonStatus,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { DisciplineService } from './discipline.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const discipline = new DisciplineService(prisma);

  const suffix = Date.now().toString();

  try {
    const league = await prisma.organization.findUniqueOrThrow({
      where: { code: 'LFPB' },
    });

    const dragonsOrg = await prisma.organization.findUniqueOrThrow({
      where: { code: 'DRAGONS' },
      include: { club: true },
    });

    const azizaOrg = await prisma.organization.findUniqueOrThrow({
      where: { code: 'AZIZA' },
      include: { club: true },
    });

    if (!dragonsOrg.club || !azizaOrg.club) {
      throw new Error('Clubs de test introuvables');
    }

    const season = await prisma.season.upsert({
      where: { name: `DISCIPLINE-SMOKE-${suffix}` },
      update: {},
      create: {
        name: `DISCIPLINE-SMOKE-${suffix}`,
        startDate: new Date('2026-08-01'),
        endDate: new Date('2027-06-30'),
        status: SeasonStatus.ACTIVE,
      },
    });

    const competition = await prisma.competition.create({
      data: {
        organizationId: league.id,
        seasonId: season.id,
        name: `Discipline Smoke ${suffix}`,
        code: `DISC-${suffix}`,
        division: Division.LIGUE_1,
        format: CompetitionFormat.DOUBLE_ROUND_ROBIN,
        status: CompetitionStatus.IN_PROGRESS,
      },
    });

    const person = await prisma.person.create({
      data: {
        firstName: 'Test',
        lastName: `Discipline-${suffix}`,
        birthDate: new Date('2000-01-01'),
        nationality: 'Béninoise',
        federationId: `DISC-${suffix}`,
      },
    });

    const registration = await prisma.registration.create({
      data: {
        personId: person.id,
        organizationId: dragonsOrg.id,
        category: RegistrationCategory.PLAYER,
        status: RegistrationStatus.VALIDATED,
        startDate: new Date('2026-08-01'),
        deduplicationKey: `discipline-smoke:${suffix}`,
      },
    });

    await prisma.playerProfile.create({
      data: {
        registrationId: registration.id,
        position: 'MIDFIELDER',
        shirtNumber: 99,
      },
    });

    await prisma.license.create({
      data: {
        registrationId: registration.id,
        number: `DISC-LIC-${suffix}`,
        season: season.name,
        status: LicenseStatus.ISSUED_BY_FBF,
        validFrom: new Date('2026-08-01'),
        validUntil: new Date('2027-06-30'),
      },
    });

    const match1 = await prisma.match.create({
      data: {
        competitionId: competition.id,
        homeClubId: dragonsOrg.club.id,
        awayClubId: azizaOrg.club.id,
        kickoffAt: new Date('2026-11-01T16:00:00Z'),
        status: MatchStatus.COMPLETED,
        homeScore: 1,
        awayScore: 0,
      },
    });

    console.log('\n=== 1. Création suspension ===');

    await discipline.createSuspension({
      organizationId: league.id,
      competitionId: competition.id,
      registrationId: registration.id,
      matchesTotal: 1,
      reason: 'Smoke test suspension',
      source: 'FUNCTIONAL_SMOKE',
    });

    let state = await discipline.getPlayerDisciplineState(
      competition.id,
      registration.id,
    );

    console.log({
      activeSuspension: state.activeSuspension,
      yellowCards: state.yellowCards,
      redCards: state.redCards,
    });

    if (!state.activeSuspension) {
      throw new Error('La suspension aurait dû être active');
    }

    console.log('\n=== 2. Purge du match manqué ===');

    const served = await discipline.serveSuspensionMatch({
      organizationId: league.id,
      competitionId: competition.id,
      registrationId: registration.id,
      matchId: match1.id,
    });

    if (!served) {
      throw new Error('La suspension aurait dû être purgée');
    }

    state = await discipline.getPlayerDisciplineState(
      competition.id,
      registration.id,
    );

    console.log({
      activeSuspension: state.activeSuspension,
      yellowCards: state.yellowCards,
      redCards: state.redCards,
    });

    if (state.activeSuspension) {
      throw new Error('La suspension aurait dû être terminée');
    }

    console.log('\n✅ DISCIPLINE FUNCTIONAL SMOKE OK');
    console.log(`competition=${competition.id}`);
    console.log(`registration=${registration.id}`);
    console.log(`match=${match1.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('\n❌ DISCIPLINE FUNCTIONAL SMOKE FAILED');
  console.error(error);
  process.exit(1);
});
