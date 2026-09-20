import { MatchHomologationStatus, Role } from "@prisma/client";
import { CompetitionsService } from "./competitions.service";

describe("CompetitionsService - standings", () => {
  const actor = {
    userId: "league-user",
    memberships: [
      {
        organizationId: "league-org",
        role: Role.LIGUE_ADMIN,
      },
    ],
  };

  const entries = [
    {
      competitionId: "competition-1",
      clubId: "dragons",
      active: true,
      club: {
        id: "dragons",
        organization: {
          id: "dragons-org",
          name: "Dragons FC",
        },
      },
    },
    {
      competitionId: "competition-1",
      clubId: "aziza",
      active: true,
      club: {
        id: "aziza",
        organization: {
          id: "aziza-org",
          name: "RC Aziza FC",
        },
      },
    },
    {
      competitionId: "competition-1",
      clubId: "beke",
      active: true,
      club: {
        id: "beke",
        organization: {
          id: "beke-org",
          name: "Béké FC",
        },
      },
    },
  ];

  const competition = {
    id: "competition-1",
    organizationId: "league-org",
    name: "Championnat professionnel Ligue 1",
    code: "L1",
    entries,
  };

  let prisma: any;
  let tenantAccess: any;
  let service: CompetitionsService;

  beforeEach(() => {
    prisma = {
      competition: {
        findUnique: jest.fn().mockResolvedValue(competition),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    tenantAccess = {
      assertOrganizationAccess: jest.fn(),
    };

    service = new CompetitionsService(
      prisma,
      tenantAccess,
      {} as any,
      {} as any,
    );
  });

  it("retourne tous les clubs engagés même sans match homologué", async () => {
    const result = await service.getStandings(actor, "competition-1");

    expect(result.homologatedMatchesCount).toBe(0);
    expect(result.standings).toHaveLength(3);

    for (const row of result.standings) {
      expect(row.played).toBe(0);
      expect(row.won).toBe(0);
      expect(row.drawn).toBe(0);
      expect(row.lost).toBe(0);
      expect(row.goalsFor).toBe(0);
      expect(row.goalsAgainst).toBe(0);
      expect(row.goalDifference).toBe(0);
      expect(row.points).toBe(0);
    }
  });

  it("demande uniquement les matchs HOMOLOGATED avec scores officiels", async () => {
    await service.getStandings(actor, "competition-1");

    expect(prisma.match.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          competitionId: "competition-1",
          homologationStatus: MatchHomologationStatus.HOMOLOGATED,
          officialHomeScore: { not: null },
          officialAwayScore: { not: null },
        },
      }),
    );
  });

  it("comptabilise une victoire homologuée à 3 points", async () => {
    prisma.match.findMany.mockResolvedValue([
      {
        id: "match-1",
        homeClubId: "dragons",
        awayClubId: "aziza",
        officialHomeScore: 2,
        officialAwayScore: 1,
      },
    ]);

    const result = await service.getStandings(actor, "competition-1");

    const dragons = result.standings.find((row) => row.clubId === "dragons");
    const aziza = result.standings.find((row) => row.clubId === "aziza");

    expect(dragons).toEqual(
      expect.objectContaining({
        position: 1,
        played: 1,
        won: 1,
        drawn: 0,
        lost: 0,
        goalsFor: 2,
        goalsAgainst: 1,
        goalDifference: 1,
        points: 3,
      }),
    );

    expect(aziza).toEqual(
      expect.objectContaining({
        played: 1,
        won: 0,
        drawn: 0,
        lost: 1,
        goalsFor: 1,
        goalsAgainst: 2,
        goalDifference: -1,
        points: 0,
      }),
    );
  });

  it("comptabilise un match nul homologué à 1 point par club", async () => {
    prisma.match.findMany.mockResolvedValue([
      {
        id: "match-1",
        homeClubId: "dragons",
        awayClubId: "aziza",
        officialHomeScore: 1,
        officialAwayScore: 1,
      },
    ]);

    const result = await service.getStandings(actor, "competition-1");

    const dragons = result.standings.find((row) => row.clubId === "dragons");
    const aziza = result.standings.find((row) => row.clubId === "aziza");

    expect(dragons).toEqual(
      expect.objectContaining({
        played: 1,
        drawn: 1,
        points: 1,
        goalsFor: 1,
        goalsAgainst: 1,
        goalDifference: 0,
      }),
    );

    expect(aziza).toEqual(
      expect.objectContaining({
        played: 1,
        drawn: 1,
        points: 1,
        goalsFor: 1,
        goalsAgainst: 1,
        goalDifference: 0,
      }),
    );
  });

  it("cumule correctement plusieurs matchs homologués", async () => {
    prisma.match.findMany.mockResolvedValue([
      {
        id: "match-1",
        homeClubId: "dragons",
        awayClubId: "aziza",
        officialHomeScore: 2,
        officialAwayScore: 0,
      },
      {
        id: "match-2",
        homeClubId: "beke",
        awayClubId: "dragons",
        officialHomeScore: 1,
        officialAwayScore: 1,
      },
      {
        id: "match-3",
        homeClubId: "aziza",
        awayClubId: "beke",
        officialHomeScore: 3,
        officialAwayScore: 1,
      },
    ]);

    const result = await service.getStandings(actor, "competition-1");

    const dragons = result.standings.find((row) => row.clubId === "dragons");
    const aziza = result.standings.find((row) => row.clubId === "aziza");
    const beke = result.standings.find((row) => row.clubId === "beke");

    expect(dragons).toEqual(
      expect.objectContaining({
        played: 2,
        won: 1,
        drawn: 1,
        lost: 0,
        goalsFor: 3,
        goalsAgainst: 1,
        goalDifference: 2,
        points: 4,
      }),
    );

    expect(aziza).toEqual(
      expect.objectContaining({
        played: 2,
        won: 1,
        drawn: 0,
        lost: 1,
        goalsFor: 3,
        goalsAgainst: 3,
        goalDifference: 0,
        points: 3,
      }),
    );

    expect(beke).toEqual(
      expect.objectContaining({
        played: 2,
        won: 0,
        drawn: 1,
        lost: 1,
        goalsFor: 2,
        goalsAgainst: 4,
        goalDifference: -2,
        points: 1,
      }),
    );
  });

  it("utilise le score officiel et non le score terrain corrigé administrativement", async () => {
    prisma.match.findMany.mockResolvedValue([
      {
        id: "match-1",
        homeClubId: "dragons",
        awayClubId: "aziza",

        // Le score terrain 2-1 n'est volontairement pas fourni
        // au moteur de classement. Le moteur ne sélectionne que
        // les scores officiels homologués.
        officialHomeScore: 0,
        officialAwayScore: 3,
      },
    ]);

    const result = await service.getStandings(actor, "competition-1");

    const dragons = result.standings.find((row) => row.clubId === "dragons");
    const aziza = result.standings.find((row) => row.clubId === "aziza");

    expect(aziza).toEqual(
      expect.objectContaining({
        won: 1,
        goalsFor: 3,
        goalsAgainst: 0,
        goalDifference: 3,
        points: 3,
      }),
    );

    expect(dragons).toEqual(
      expect.objectContaining({
        lost: 1,
        goalsFor: 0,
        goalsAgainst: 3,
        goalDifference: -3,
        points: 0,
      }),
    );
  });

  it("contrôle l’accès tenant de la compétition", async () => {
    await service.getStandings(actor, "competition-1");

    expect(tenantAccess.assertOrganizationAccess).toHaveBeenCalledWith(
      actor,
      "league-org",
    );
  });
});
