import { MatchHomologationStatus, Role } from "@prisma/client";
import { CompetitionsService } from "./competitions.service";

describe("CompetitionsService - player statistics", () => {
  const actor = {
    userId: "league-user",
    memberships: [
      {
        role: Role.LIGUE_ADMIN,
        organizationId: "league-org",
      },
    ],
  } as any;

  const competition = {
    id: "competition-1",
    name: "Ligue 1",
    code: "L1",
    organizationId: "league-org",
  };

  const registrations = [
    {
      id: "player-1",
      person: {
        firstName: "Jean",
        lastName: "Attaquant",
        federationId: "FBF-001",
      },
    },
    {
      id: "player-2",
      person: {
        firstName: "Paul",
        lastName: "Défenseur",
        federationId: "FBF-002",
      },
    },
  ];

  const clubs = [
    {
      id: "home-club",
      shortName: "Dragons",
      organization: { name: "Dragons FC" },
    },
    {
      id: "away-club",
      shortName: "Aziza",
      organization: { name: "RC Aziza FC" },
    },
  ];

  function makePrisma(events: any[] = []) {
    return {
      competition: {
        findUnique: jest.fn().mockResolvedValue(competition),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([{ id: "homologated-match-1" }]),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue(events),
      },
      registration: {
        findMany: jest.fn().mockResolvedValue(registrations),
      },
      club: {
        findMany: jest.fn().mockResolvedValue(clubs),
      },
    } as any;
  }

  function makeService(prisma: any) {
    return new CompetitionsService(
      prisma,
      {
        assertOrganizationAccess: jest.fn(),
      } as any,
      {} as any,
      {} as any,
    );
  }

  it("ne sélectionne que les matchs homologués de la compétition", async () => {
    const prisma = makePrisma();

    await makeService(prisma).getPlayerStatistics(actor, "competition-1");

    expect(prisma.match.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          competitionId: "competition-1",
          homologationStatus: MatchHomologationStatus.HOMOLOGATED,
        },
        select: { id: true },
      }),
    );
  });

  it("ne lit que les buts et cartons des matchs homologués", async () => {
    const prisma = makePrisma();

    await makeService(prisma).getPlayerStatistics(actor, "competition-1");

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          resourceType: "MatchEvent",
          resourceId: { in: ["homologated-match-1"] },
          action: {
            in: [
              "MATCH_EVENT_GOAL",
              "MATCH_EVENT_YELLOW_CARD",
              "MATCH_EVENT_RED_CARD",
            ],
          },
        },
      }),
    );
  });

  it("compte les buts officiels événementiels par joueur", async () => {
    const prisma = makePrisma([
      {
        action: "MATCH_EVENT_GOAL",
        resourceId: "homologated-match-1",
        metadata: {
          registrationId: "player-1",
          clubId: "home-club",
        },
      },
      {
        action: "MATCH_EVENT_GOAL",
        resourceId: "homologated-match-1",
        metadata: {
          registrationId: "player-1",
          clubId: "home-club",
        },
      },
    ]);

    const result = await makeService(prisma).getPlayerStatistics(
      actor,
      "competition-1",
    );

    expect(result.topScorers[0]).toEqual(
      expect.objectContaining({
        registrationId: "player-1",
        firstName: "Jean",
        lastName: "Attaquant",
        clubId: "home-club",
        goals: 2,
      }),
    );
  });

  it("compte séparément cartons jaunes et rouges", async () => {
    const prisma = makePrisma([
      {
        action: "MATCH_EVENT_YELLOW_CARD",
        resourceId: "homologated-match-1",
        metadata: {
          registrationId: "player-2",
          clubId: "away-club",
        },
      },
      {
        action: "MATCH_EVENT_YELLOW_CARD",
        resourceId: "homologated-match-1",
        metadata: {
          registrationId: "player-2",
          clubId: "away-club",
        },
      },
      {
        action: "MATCH_EVENT_RED_CARD",
        resourceId: "homologated-match-1",
        metadata: {
          registrationId: "player-2",
          clubId: "away-club",
        },
      },
    ]);

    const result = await makeService(prisma).getPlayerStatistics(
      actor,
      "competition-1",
    );

    const player = result.players.find(
      (item: any) => item.registrationId === "player-2",
    );

    expect(player).toEqual(
      expect.objectContaining({
        yellowCards: 2,
        redCards: 1,
        goals: 0,
      }),
    );
  });

  it("ignore un événement sans joueur exploitable", async () => {
    const prisma = makePrisma([
      {
        action: "MATCH_EVENT_GOAL",
        resourceId: "homologated-match-1",
        metadata: {
          clubId: "home-club",
          registrationId: null,
        },
      },
    ]);

    const result = await makeService(prisma).getPlayerStatistics(
      actor,
      "competition-1",
    );

    expect(result.players).toEqual([]);
    expect(result.topScorers).toEqual([]);
  });

  it("ne fabrique aucun but à partir du score officiel administratif", async () => {
    const prisma = makePrisma([]);

    const result = await makeService(prisma).getPlayerStatistics(
      actor,
      "competition-1",
    );

    expect(result.players).toEqual([]);
    expect(result.topScorers).toEqual([]);
    expect(result.homologatedMatchesCount).toBe(1);
  });

  it("contrôle l’accès tenant de la compétition", async () => {
    const prisma = makePrisma();
    const tenantAccess = {
      assertOrganizationAccess: jest.fn(),
    };

    const service = new CompetitionsService(
      prisma,
      tenantAccess as any,
      {} as any,
      {} as any,
    );

    await service.getPlayerStatistics(actor, "competition-1");

    expect(tenantAccess.assertOrganizationAccess).toHaveBeenCalledWith(
      actor,
      "league-org",
    );
  });
});
