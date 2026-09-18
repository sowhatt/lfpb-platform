import {
  CompetitionFormat,
  CompetitionStatus,
  Division,
  LicenseStatus,
  MatchStatus,
  PlayerPosition,
  RegistrationCategory,
  RegistrationStatus,
  Role,
  SeasonStatus,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { DisciplineService } from './discipline.service';
import { MatchSheetsService } from '../match-sheets/match-sheets.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const discipline = new DisciplineService(prisma);
  const matchSheets = new MatchSheetsService(prisma, discipline);

  const suffix = Date.now().toString();

  let competitionId: string | null = null;
  let seasonId: string | null = null;
  let registrationId: string | null = null;
  let personId: string | null = null;

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
      throw new Error('Clubs Dragons/Aziza introuvables');
    }

    const season = await prisma.season.create({
      data: {
        name: `DISC-ELIG-${suffix}`,
        startDate: new Date('2026-08-01'),
        endDate: new Date('2027-06-30'),
        status: SeasonStatus.ACTIVE,
      },
    });

    seasonId = season.id;

    const competition = await prisma.competition.create({
      data: {
        organizationId: league.id,
        seasonId: season.id,
        name: `Discipline Eligibility ${suffix}`,
        code: `DISC-ELIG-${suffix}`,
        division: Division.LIGUE_1,
        format: CompetitionFormat.DOUBLE_ROUND_ROBIN,
        status: CompetitionStatus.IN_PROGRESS,
      },
    });

    competitionId = competition.id;

    const person = await prisma.person.create({
      data: {
        firstName: 'Test',
        lastName: `Eligibility-${suffix}`,
        birthDate: new Date('2000-01-01'),
        nationality: 'Béninoise',
        federationId: `DISC-ELIG-${suffix}`,
      },
    });

    personId = person.id;

    const registration = await prisma.registration.create({
      data: {
        personId: person.id,
        organizationId: dragonsOrg.id,
        category: RegistrationCategory.PLAYER,
        status: RegistrationStatus.VALIDATED,
        startDate: new Date('2026-08-01'),
        deduplicationKey: `discipline-eligibility:${suffix}`,
      },
    });

    registrationId = registration.id;

    await prisma.playerProfile.create({
      data: {
        registrationId: registration.id,
        position: PlayerPosition.MIDFIELDER,
        shirtNumber: 98,
      },
    });

    await prisma.license.create({
      data: {
        registrationId: registration.id,
        number: `DISC-ELIG-LIC-${suffix}`,
        season: season.name,
        status: LicenseStatus.ISSUED_BY_FBF,
        validFrom: new Date('2026-08-01'),
        validUntil: new Date('2027-06-30'),
      },
    });

    const match = await prisma.match.create({
      data: {
        competitionId: competition.id,
        homeClubId: dragonsOrg.club.id,
        awayClubId: azizaOrg.club.id,
        kickoffAt: new Date('2026-11-08T16:00:00Z'),
        status: MatchStatus.SCHEDULED,
      },
    });

    const actor = {
      userId: '00000000-0000-0000-0000-000000000001',
      email: 'functional-smoke@lfpb.test',
      memberships: [
        {
          role: Role.LIGUE_ADMIN,
          organizationId: league.id,
        },
      ],
    } as any;

    console.log('\n=== 1. Joueur avant suspension ===');

    let eligibility = await matchSheets.eligiblePlayers(
      actor,
      match.id,
      dragonsOrg.club.id,
    );

    let player = eligibility.players.find(
      (candidate) => candidate.registrationId === registration.id,
    );

    console.log({
      eligible: player?.eligible,
      reasons: player?.reasons,
      discipline: player?.discipline,
    });

    if (!player?.eligible) {
      throw new Error(
        `Le joueur devrait être éligible avant suspension : ${player?.reasons?.join(' ; ')}`,
      );
    }

    console.log('\n=== 2. Création suspension ===');

    await discipline.createSuspension({
      organizationId: league.id,
      competitionId: competition.id,
      registrationId: registration.id,
      matchesTotal: 1,
      reason: 'Suspension fonctionnelle',
      source: 'FUNCTIONAL_ELIGIBILITY_SMOKE',
    });

    eligibility = await matchSheets.eligiblePlayers(
      actor,
      match.id,
      dragonsOrg.club.id,
    );

    player = eligibility.players.find(
      (candidate) => candidate.registrationId === registration.id,
    );

    console.log({
      eligible: player?.eligible,
      reasons: player?.reasons,
      discipline: player?.discipline,
    });

    if (player?.eligible !== false) {
      throw new Error('Le joueur suspendu devrait être inéligible');
    }

    if (
      !player.reasons.some((reason: string) =>
        reason.includes('Suspension disciplinaire active'),
      )
    ) {
      throw new Error(
        'Le motif de suspension disciplinaire est absent de l’éligibilité',
      );
    }

    console.log('\n=== 3. Purge suspension ===');

    await discipline.serveSuspensionMatch({
      organizationId: league.id,
      competitionId: competition.id,
      registrationId: registration.id,
      matchId: match.id,
    });

    eligibility = await matchSheets.eligiblePlayers(
      actor,
      match.id,
      dragonsOrg.club.id,
    );

    player = eligibility.players.find(
      (candidate) => candidate.registrationId === registration.id,
    );

    console.log({
      eligible: player?.eligible,
      reasons: player?.reasons,
      discipline: player?.discipline,
    });

    if (!player?.eligible) {
      throw new Error(
        `Le joueur devrait être rééligible après purge : ${player?.reasons?.join(' ; ')}`,
      );
    }

    console.log('\n✅ DISCIPLINE + ELIGIBILITY FUNCTIONAL SMOKE OK');
  } finally {
    if (registrationId) {
      await prisma.auditLog.deleteMany({
        where: {
          resourceType: 'DisciplinarySanction',
          resourceId: registrationId,
        },
      });

      await prisma.registration.deleteMany({
        where: { id: registrationId },
      });
    }

    if (personId) {
      await prisma.person.deleteMany({
        where: { id: personId },
      });
    }

    if (competitionId) {
      await prisma.competition.deleteMany({
        where: { id: competitionId },
      });
    }

    if (seasonId) {
      await prisma.season.deleteMany({
        where: { id: seasonId },
      });
    }

    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('\n❌ DISCIPLINE + ELIGIBILITY FUNCTIONAL SMOKE FAILED');
  console.error(error);
  process.exit(1);
});
