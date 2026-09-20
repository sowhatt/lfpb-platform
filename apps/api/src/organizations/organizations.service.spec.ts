import { ConflictException } from "@nestjs/common";
import { Division, OrganizationType, Prisma } from "@prisma/client";
import { OrganizationsService } from "./organizations.service";

describe("OrganizationsService - club management", () => {
  const actor = {
    userId: "00000000-0000-0000-0000-000000000001",
    memberships: [],
  };

  const organization = {
    id: "00000000-0000-0000-0000-000000000010",
    name: "Club Test LFPB",
    code: "TESTLFPB",
    type: OrganizationType.CLUB,
    active: true,
    club: {
      id: "00000000-0000-0000-0000-000000000020",
      shortName: "Test LFPB",
      division: Division.LIGUE_2,
      city: "Cotonou",
    },
  };

  function setup() {
    const tx = {
      organization: {
        create: jest.fn().mockResolvedValue(organization),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: "audit-1" }),
      },
      clubHistoryEvent: {
        create: jest.fn().mockResolvedValue({ id: "history-1" }),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
    };

    const tenantAccess = {
      organizationScope: jest.fn(),
      assertOrganizationAccess: jest.fn(),
    };

    const service = new OrganizationsService(
      prisma as never,
      tenantAccess as never,
    );

    return { service, prisma, tx };
  }

  it("crée une organisation CLUB et sa fiche club", async () => {
    const { service, tx } = setup();

    const result = await service.createClub(actor, {
      name: " Club Test LFPB ",
      code: " testlfpb ",
      shortName: " Test LFPB ",
      division: Division.LIGUE_2,
      city: " Cotonou ",
    });

    expect(result).toEqual(organization);
    expect(tx.organization.create).toHaveBeenCalledWith({
      data: {
        name: "Club Test LFPB",
        code: "TESTLFPB",
        type: OrganizationType.CLUB,
        club: {
          create: {
            shortName: "Test LFPB",
            division: Division.LIGUE_2,
            city: "Cotonou",
          },
        },
      },
      include: { club: true },
    });
  });

  it("initialise la Vie du club lors de la création", async () => {
    const { service, tx } = setup();

    await service.createClub(actor, {
      name: "Club Test LFPB",
      code: "TESTLFPB",
      shortName: "Test LFPB",
      division: Division.LIGUE_2,
      city: "Cotonou",
    });

    expect(tx.clubHistoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clubId: organization.club.id,
        type: "CREATED",
        title: "Création du club",
        newValue: "Club Test LFPB",
        actorUserId: actor.userId,
      }),
    });
  });

  it("trace la création du club dans AuditLog", async () => {
    const { service, tx } = setup();

    await service.createClub(actor, {
      name: "Club Test LFPB",
      code: "TESTLFPB",
      shortName: "Test LFPB",
      division: Division.LIGUE_2,
      city: "Cotonou",
    });

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: actor.userId,
        organizationId: organization.id,
        action: "CLUB_CREATED",
        resourceType: "Club",
        resourceId: organization.club.id,
      }),
    });
  });

  it("convertit un doublon Prisma en erreur métier", async () => {
    const { service, prisma } = setup();

    const duplicate = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "6.16.2",
        meta: { target: ["code"] },
      },
    );

    prisma.$transaction.mockRejectedValueOnce(duplicate);

    await expect(
      service.createClub(actor, {
        name: "Club Test",
        code: "DRAGONS",
        shortName: "Test",
        division: Division.LIGUE_1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("OrganizationsService - vie du club", () => {
  const actor = {
    userId: "00000000-0000-0000-0000-000000000001",
    memberships: [],
  };

  const organizationId = "00000000-0000-0000-0000-000000000010";
  const clubId = "00000000-0000-0000-0000-000000000020";

  const existingOrganization = {
    id: organizationId,
    name: "Requins de l'Atlantique FC",
    code: "REQUINS",
    type: OrganizationType.CLUB,
    active: true,
    club: {
      id: clubId,
      shortName: "Requins FC",
      division: Division.LIGUE_1,
      city: "Cotonou",
      colors: "Rouge et blanc",
    },
  };

  function setupLife() {
    const tx = {
      organization: {
        update: jest.fn(),
      },
      clubHistoryEvent: {
        create: jest.fn().mockResolvedValue({ id: "history-1" }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };

    const prisma = {
      organization: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(existingOrganization),
      },
      $transaction: jest.fn(async (callback) => callback(tx)),
    };

    const tenantAccess = {
      organizationScope: jest.fn(),
      assertOrganizationAccess: jest.fn(),
    };

    const service = new OrganizationsService(
      prisma as never,
      tenantAccess as never,
    );

    return { service, prisma, tx, tenantAccess };
  }

  it("modifie les informations courantes et historise chaque changement", async () => {
    const { service, tx, tenantAccess } = setupLife();

    const updated = {
      ...existingOrganization,
      club: {
        ...existingOrganization.club,
        shortName: "Les Requins",
        city: "Porto-Novo",
      },
    };

    tx.organization.update.mockResolvedValue(updated);

    const result = await service.updateClub(actor, organizationId, {
      shortName: " Les Requins ",
      city: " Porto-Novo ",
    });

    expect(tenantAccess.assertOrganizationAccess).toHaveBeenCalledWith(
      actor,
      organizationId,
    );

    expect(tx.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: organizationId },
        data: {
          club: {
            update: expect.objectContaining({
              shortName: "Les Requins",
              city: "Porto-Novo",
            }),
          },
        },
      }),
    );

    expect(tx.clubHistoryEvent.create).toHaveBeenCalledTimes(2);

    expect(tx.clubHistoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clubId,
        type: "SHORT_NAME_CHANGED",
        previousValue: "Requins FC",
        newValue: "Les Requins",
        actorUserId: actor.userId,
      }),
    });

    expect(tx.clubHistoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clubId,
        type: "CITY_CHANGED",
        previousValue: "Cotonou",
        newValue: "Porto-Novo",
        actorUserId: actor.userId,
      }),
    });

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CLUB_UPDATED",
        organizationId,
        resourceId: clubId,
      }),
    });

    expect(result).toEqual(updated);
  });

  it("change le nom officiel sans changer l identité technique du club", async () => {
    const { service, tx } = setupLife();

    const renamed = {
      ...existingOrganization,
      name: "Requins Atlantique FC",
      club: existingOrganization.club,
    };

    tx.organization.update.mockResolvedValue(renamed);

    const result = await service.renameClub(actor, organizationId, {
      name: " Requins Atlantique FC ",
      effectiveDate: "2026-09-20",
      reason: "Décision administrative de la Ligue",
    });

    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: organizationId },
      data: { name: "Requins Atlantique FC" },
      include: { club: true },
    });

    expect(tx.clubHistoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clubId,
        type: "RENAMED",
        previousValue: "Requins de l'Atlantique FC",
        newValue: "Requins Atlantique FC",
        reason: "Décision administrative de la Ligue",
        actorUserId: actor.userId,
      }),
    });

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CLUB_RENAMED",
        organizationId,
        resourceId: clubId,
      }),
    });

    expect(result.club?.id).toBe(clubId);
  });

  it("désactive le club sans le supprimer et conserve la trace métier", async () => {
    const { service, tx } = setupLife();

    const inactive = {
      ...existingOrganization,
      active: false,
    };

    tx.organization.update.mockResolvedValue(inactive);

    const result = await service.updateClubStatus(actor, organizationId, {
      active: false,
      reason: "Décision administrative",
    });

    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: organizationId },
      data: { active: false },
      include: { club: true },
    });

    expect(tx.clubHistoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clubId,
        type: "DEACTIVATED",
        previousValue: "ACTIF",
        newValue: "INACTIF",
        reason: "Décision administrative",
      }),
    });

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CLUB_DEACTIVATED",
        organizationId,
        resourceId: clubId,
      }),
    });

    expect(result.active).toBe(false);
  });

  it("ne crée aucun historique quand aucune information ne change", async () => {
    const { service, prisma, tx } = setupLife();

    const result = await service.updateClub(actor, organizationId, {
      shortName: "Requins FC",
      city: "Cotonou",
      colors: "Rouge et blanc",
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.clubHistoryEvent.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(result).toEqual(existingOrganization);
  });
});

describe("OrganizationsService - visibilité Ligue", () => {
  it("permet au LIGUE_ADMIN de voir aussi les organisations inactives", async () => {
    const prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const tenantAccess = {
      organizationScope: jest.fn().mockReturnValue(null),
    };

    const service = new OrganizationsService(
      prisma as never,
      tenantAccess as never,
    );

    const leagueActor = {
      userId: "00000000-0000-0000-0000-000000000001",
      memberships: [
        {
          organizationId: "00000000-0000-0000-0000-000000000099",
          role: "LIGUE_ADMIN" as const,
        },
      ],
    };

    await service.listFor(leagueActor);

    expect(prisma.organization.findMany).toHaveBeenCalledWith({
      where: {},
      include: { club: true },
      orderBy: { name: "asc" },
    });
  });

  it("conserve le filtre actif pour un utilisateur non administrateur Ligue", async () => {
    const prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const tenantAccess = {
      organizationScope: jest
        .fn()
        .mockReturnValue(["00000000-0000-0000-0000-000000000010"]),
    };

    const service = new OrganizationsService(
      prisma as never,
      tenantAccess as never,
    );

    const clubActor = {
      userId: "00000000-0000-0000-0000-000000000002",
      memberships: [
        {
          organizationId: "00000000-0000-0000-0000-000000000010",
          role: "CLUB_ADMIN" as const,
        },
      ],
    };

    await service.listFor(clubActor);

    expect(prisma.organization.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["00000000-0000-0000-0000-000000000010"],
        },
        active: true,
      },
      include: { club: true },
      orderBy: { name: "asc" },
    });
  });
});

describe("OrganizationsService - parcours sportif du club", () => {
  const organizationId = "00000000-0000-0000-0000-000000000100";
  const clubId = "00000000-0000-0000-0000-000000000101";
  const seasonId = "00000000-0000-0000-0000-000000000102";
  const userId = "00000000-0000-0000-0000-000000000103";

  const leagueActor = {
    userId,
    memberships: [
      {
        organizationId: "00000000-0000-0000-0000-000000000001",
        role: "LIGUE_ADMIN" as const,
      },
    ],
  };

  function buildService(seasonStatus: "ACTIVE" | "CLOSED") {
    const clubSeason = {
      id: "00000000-0000-0000-0000-000000000104",
      clubId,
      seasonId,
      division: "LIGUE_1",
      finalRank: null,
      outcome: null,
      notes: null,
      season: {
        id: seasonId,
        name: "2026-2027",
        status: seasonStatus,
      },
    };

    const tx = {
      clubSeason: {
        upsert: jest.fn().mockResolvedValue(clubSeason),
      },
      club: {
        update: jest.fn().mockResolvedValue({
          id: clubId,
          division: "LIGUE_1",
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          id: organizationId,
          name: "Requins de l'Atlantique FC",
          active: true,
          club: {
            id: clubId,
            division: "LIGUE_2",
          },
        }),
      },
      season: {
        findUnique: jest.fn().mockResolvedValue({
          id: seasonId,
          name: "2026-2027",
          status: seasonStatus,
        }),
      },
      $transaction: jest.fn(async (callback) => callback(tx)),
    };

    const tenantAccess = {
      assertOrganizationAccess: jest.fn(),
    };

    const service = new OrganizationsService(
      prisma as never,
      tenantAccess as never,
    );

    return { service, prisma, tx, tenantAccess };
  }

  it("synchronise la division courante pour une saison ACTIVE", async () => {
    const { service, tx } = buildService("ACTIVE");

    await service.upsertClubSeason(leagueActor, organizationId, seasonId, {
      division: "LIGUE_1",
    });

    expect(tx.clubSeason.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clubId_seasonId: {
            clubId,
            seasonId,
          },
        },
        create: expect.objectContaining({
          clubId,
          seasonId,
          division: "LIGUE_1",
        }),
        update: expect.objectContaining({
          division: "LIGUE_1",
        }),
      }),
    );

    expect(tx.club.update).toHaveBeenCalledWith({
      where: { id: clubId },
      data: { division: "LIGUE_1" },
    });

    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("ne modifie pas la division courante pour une saison CLOSED", async () => {
    const { service, tx } = buildService("CLOSED");

    await service.upsertClubSeason(leagueActor, organizationId, seasonId, {
      division: "LIGUE_1",
      finalRank: 1,
      outcome: "PROMOTED",
      notes: "Champion et promu",
    });

    expect(tx.clubSeason.upsert).toHaveBeenCalledTimes(1);
    expect(tx.club.update).not.toHaveBeenCalled();

    expect(tx.clubSeason.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          finalRank: 1,
          outcome: "PROMOTED",
          notes: "Champion et promu",
        }),
      }),
    );
  });

  it("utilise la clé club-saison pour éviter un doublon d'engagement", async () => {
    const { service, tx } = buildService("CLOSED");

    await service.upsertClubSeason(leagueActor, organizationId, seasonId, {
      division: "LIGUE_2",
      finalRank: 4,
      outcome: "MAINTAINED",
    });

    expect(tx.clubSeason.upsert).toHaveBeenCalledTimes(1);

    expect(tx.clubSeason.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clubId_seasonId: {
            clubId,
            seasonId,
          },
        },
      }),
    );
  });
});

describe("OrganizationsService - synthèse du parcours sportif", () => {
  it("calcule les saisons L1 L2 titres montées et relégations", async () => {
    const organizationId = "00000000-0000-0000-0000-000000000200";
    const clubId = "00000000-0000-0000-0000-000000000201";

    const prisma = {
      organization: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: organizationId,
          name: "Requins de l'Atlantique FC",
          code: "REQUINS",
          type: "CLUB",
          active: true,
          club: {
            id: clubId,
            organizationId,
            shortName: "Requins FC",
            division: "LIGUE_1",
            city: "Cotonou",
            colors: null,
            seasons: [
              {
                id: "00000000-0000-0000-0000-000000000211",
                clubId,
                seasonId: "00000000-0000-0000-0000-000000000221",
                division: "LIGUE_1",
                finalRank: null,
                outcome: null,
                season: {
                  name: "2026-2027",
                  status: "ACTIVE",
                  startDate: new Date("2026-08-01"),
                },
              },
              {
                id: "00000000-0000-0000-0000-000000000212",
                clubId,
                seasonId: "00000000-0000-0000-0000-000000000222",
                division: "LIGUE_2",
                finalRank: 1,
                outcome: "PROMOTED",
                season: {
                  name: "2025-2026",
                  status: "CLOSED",
                  startDate: new Date("2025-08-01"),
                },
              },
              {
                id: "00000000-0000-0000-0000-000000000213",
                clubId,
                seasonId: "00000000-0000-0000-0000-000000000223",
                division: "LIGUE_2",
                finalRank: 4,
                outcome: "MAINTAINED",
                season: {
                  name: "2024-2025",
                  status: "CLOSED",
                  startDate: new Date("2024-08-01"),
                },
              },
            ],
            historyEvents: [],
          },
        }),
      },
    };

    const tenantAccess = {
      assertOrganizationAccess: jest.fn(),
    };

    const service = new OrganizationsService(
      prisma as never,
      tenantAccess as never,
    );

    const actor = {
      userId: "00000000-0000-0000-0000-000000000202",
      memberships: [
        {
          organizationId: "00000000-0000-0000-0000-000000000001",
          role: "LIGUE_ADMIN" as const,
        },
      ],
    };

    const result = await service.findOneFor(actor, organizationId);

    expect(result.club).not.toBeNull();

    if (!result.club || !("sportingSummary" in result.club)) {
      throw new Error("Synthèse sportive absente de la fiche club");
    }

    expect(result.club.sportingSummary).toEqual({
      totalSeasons: 3,
      league1Seasons: 1,
      league2Seasons: 2,
      titles: 1,
      promotions: 1,
      relegations: 0,
    });

    expect(tenantAccess.assertOrganizationAccess).toHaveBeenCalledWith(
      actor,
      organizationId,
    );
  });
});
