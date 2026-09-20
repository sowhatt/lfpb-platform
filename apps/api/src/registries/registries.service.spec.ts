import { ConflictException } from "@nestjs/common";
import {
  OrganizationType,
  PlayerPosition,
  RegistrationCategory,
  RegistrationStatus,
} from "@prisma/client";
import { RegistriesService } from "./registries.service";

describe("RegistriesService - Player 360 identity", () => {
  const actor = {
    userId: "00000000-0000-0000-0000-000000000001",
    memberships: [],
  };

  const clubId = "00000000-0000-0000-0000-000000000010";
  const personId = "00000000-0000-0000-0000-000000000020";
  const registrationId = "00000000-0000-0000-0000-000000000030";

  const input = {
    organizationId: clubId,
    firstName: " Jean ",
    lastName: " ADJOVI ",
    birthDate: "2002-03-15",
    nationality: "Béninoise",
    position: PlayerPosition.FORWARD,
    shirtName: "ADJOVI",
    shirtNumber: 9,
    startDate: "2026-08-01",
  };

  function setup(options?: {
    existingRegistration?: { id: string } | null;
    identityCandidates?: Array<{
      id: string;
      identityKey: string | null;
      federationId: string | null;
    }>;
  }) {
    const registration = {
      id: registrationId,
      personId,
      organizationId: clubId,
      category: RegistrationCategory.PLAYER,
    };

    const tx = {
      person: {
        create: jest.fn().mockResolvedValue({ id: personId }),
        update: jest.fn().mockResolvedValue({ id: personId }),
      },
      registration: {
        create: jest.fn().mockResolvedValue(registration),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };

    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          type: OrganizationType.CLUB,
        }),
      },
      registration: {
        findFirst: jest
          .fn()
          .mockResolvedValue(options?.existingRegistration ?? null),
      },
      person: {
        findMany: jest
          .fn()
          .mockResolvedValue(options?.identityCandidates ?? []),
      },
      $transaction: jest.fn(async (callback) => callback(tx)),
    };

    const tenantAccess = {
      assertOrganizationAccess: jest.fn(),
    };

    const service = new RegistriesService(
      prisma as never,
      tenantAccess as never,
    );

    return { service, prisma, tx, tenantAccess };
  }

  it("crée une Person et une Registration pour un nouveau joueur", async () => {
    const { service, tx } = setup();

    await service.createPlayer(actor, input);

    expect(tx.person.create).toHaveBeenCalledTimes(1);

    expect(tx.registration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personId,
          organizationId: clubId,
          category: RegistrationCategory.PLAYER,
        }),
      }),
    );

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PLAYER_CREATED",
        resourceType: "Registration",
        resourceId: registrationId,
        metadata: expect.objectContaining({
          personId,
          reusedPerson: false,
        }),
      }),
    });
  });

  it("refuse de rattacher automatiquement une Person existante sur la seule identité démographique", async () => {
    const { service, tx } = setup({
      identityCandidates: [
        {
          id: personId,
          identityKey: "existing-identity-key",
          federationId: null,
        },
      ],
    });

    await expect(service.createPlayer(actor, input)).rejects.toThrow(
      "Digital Foot ne peut pas confirmer automatiquement",
    );

    expect(tx.person.create).not.toHaveBeenCalled();
    expect(tx.person.update).not.toHaveBeenCalled();
    expect(tx.registration.create).not.toHaveBeenCalled();
  });

  it("refuse un joueur déjà présent dans le même club", async () => {
    const { service, tx } = setup({
      existingRegistration: { id: registrationId },
    });

    await expect(service.createPlayer(actor, input)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(tx.registration.create).not.toHaveBeenCalled();
  });

  it("refuse de fusionner automatiquement plusieurs identités candidates", async () => {
    const { service, tx } = setup({
      identityCandidates: [
        {
          id: personId,
          identityKey: null,
          federationId: null,
        },
        {
          id: "00000000-0000-0000-0000-000000000021",
          identityKey: null,
          federationId: null,
        },
      ],
    });

    await expect(service.createPlayer(actor, input)).rejects.toThrow(
      "Digital Foot ne peut pas confirmer automatiquement",
    );

    expect(tx.person.create).not.toHaveBeenCalled();
    expect(tx.person.update).not.toHaveBeenCalled();
    expect(tx.registration.create).not.toHaveBeenCalled();
  });
});

describe("RegistriesService - Player 360", () => {
  const actor = {
    userId: "00000000-0000-0000-0000-000000000001",
    memberships: [],
  };

  const personId = "00000000-0000-0000-0000-000000000020";

  function registration(
    id: string,
    organizationId: string,
    name: string,
    startDate: string,
    endDate: string | null,
  ) {
    return {
      id,
      personId,
      organizationId,
      category: RegistrationCategory.PLAYER,
      status: "VALIDATED",
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      createdAt: new Date(startDate),
      updatedAt: new Date(startDate),
      organization: {
        id: organizationId,
        name,
        code: name.toUpperCase().replaceAll(" ", "-"),
        club: {
          id: `${organizationId}-club`,
          shortName: name,
          division: "LIGUE_1",
          city: "Cotonou",
        },
      },
      playerProfile: {
        registrationId: id,
        position: PlayerPosition.FORWARD,
        shirtName: "ADJOVI",
        shirtNumber: 9,
      },
      licenses: [],
      documents: [],
    };
  }

  function makeService(registrations: ReturnType<typeof registration>[]) {
    const prisma = {
      competition: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      person: {
        findUnique: jest.fn().mockResolvedValue({
          id: personId,
          firstName: "Jean",
          lastName: "Adjovi",
          birthDate: new Date("2002-03-15"),
          nationality: "Béninoise",
          federationId: null,
          identityKey: "identity-key",
          photoData: null,
          photoMimeType: null,
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2026-01-01"),
          registrations,
        }),
      },
    };

    const tenantAccess = {
      organizationScope: jest.fn().mockReturnValue(null),
    };

    return new RegistriesService(prisma as never, tenantAccess as never);
  }

  it("agrège le parcours interclubs autour du personId", async () => {
    const service = makeService([
      registration(
        "00000000-0000-0000-0000-000000000031",
        "00000000-0000-0000-0000-000000000011",
        "Requins",
        "2026-08-01",
        null,
      ),
      registration(
        "00000000-0000-0000-0000-000000000030",
        "00000000-0000-0000-0000-000000000010",
        "Dragons",
        "2025-08-01",
        "2026-06-30",
      ),
    ]);

    const result = await service.getPlayer360(actor, personId);

    expect(result.person.id).toBe(personId);
    expect(result.current?.club?.name).toBe("Requins");
    expect(result.career).toHaveLength(2);
    expect(result.summary.registrations).toBe(2);
    expect(result.summary.clubs).toBe(2);
  });

  it("refuse de choisir arbitrairement entre deux inscriptions actives", async () => {
    const service = makeService([
      registration(
        "00000000-0000-0000-0000-000000000031",
        "00000000-0000-0000-0000-000000000011",
        "Requins",
        "2026-08-01",
        null,
      ),
      registration(
        "00000000-0000-0000-0000-000000000030",
        "00000000-0000-0000-0000-000000000010",
        "Dragons",
        "2026-07-01",
        null,
      ),
    ]);

    await expect(service.getPlayer360(actor, personId)).rejects.toThrow(
      "Plusieurs inscriptions joueur sont simultanément actives",
    );
  });
});

describe("RegistriesService - Player 360 statistics and discipline", () => {
  it("consolide les statistiques homologuées et la discipline des inscriptions du joueur", async () => {
    const personId = "00000000-0000-0000-0000-000000000100";
    const oldRegistrationId = "00000000-0000-0000-0000-000000000101";
    const currentRegistrationId = "00000000-0000-0000-0000-000000000102";
    const competitionId = "00000000-0000-0000-0000-000000000200";

    const registrations = [
      {
        id: currentRegistrationId,
        personId,
        organizationId: "00000000-0000-0000-0000-000000000301",
        category: RegistrationCategory.PLAYER,
        status: RegistrationStatus.VALIDATED,
        startDate: new Date("2026-08-01"),
        endDate: null,
        createdAt: new Date("2026-08-01"),
        updatedAt: new Date("2026-08-01"),
        organization: {
          id: "00000000-0000-0000-0000-000000000301",
          name: "Requins",
          code: "REQUINS",
          club: {
            id: "00000000-0000-0000-0000-000000000401",
            shortName: "Requins",
            division: "LIGUE_1",
            city: "Cotonou",
          },
        },
        playerProfile: null,
        licenses: [],
        documents: [],
      },
      {
        id: oldRegistrationId,
        personId,
        organizationId: "00000000-0000-0000-0000-000000000302",
        category: RegistrationCategory.PLAYER,
        status: RegistrationStatus.ARCHIVED,
        startDate: new Date("2025-08-01"),
        endDate: new Date("2026-06-30"),
        createdAt: new Date("2025-08-01"),
        updatedAt: new Date("2026-06-30"),
        organization: {
          id: "00000000-0000-0000-0000-000000000302",
          name: "Dragons",
          code: "DRAGONS",
          club: {
            id: "00000000-0000-0000-0000-000000000402",
            shortName: "Dragons",
            division: "LIGUE_1",
            city: "Porto-Novo",
          },
        },
        playerProfile: null,
        licenses: [],
        documents: [],
      },
    ];

    const prisma = {
      person: {
        findUnique: jest.fn().mockResolvedValue({
          id: personId,
          firstName: "Jean",
          lastName: "Adjovi",
          birthDate: new Date("2002-03-15"),
          nationality: "Béninoise",
          federationId: null,
          identityKey: "player-360-test",
          photoData: null,
          photoMimeType: null,
          createdAt: new Date("2025-01-01"),
          updatedAt: new Date("2026-08-01"),
          registrations,
        }),
      },

      competition: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: competitionId,
            name: "Ligue 1",
            code: "L1-2026",
            division: "LIGUE_1",
            season: {
              id: "00000000-0000-0000-0000-000000000500",
              name: "2026-2027",
              startDate: new Date("2026-09-01"),
              endDate: new Date("2027-07-31"),
            },
            matches: [
              { id: "00000000-0000-0000-0000-000000000601" },
              { id: "00000000-0000-0000-0000-000000000602" },
            ],
          },
        ]),
      },

      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "event-1",
            action: "MATCH_EVENT_GOAL",
            metadata: {
              registrationId: oldRegistrationId,
            },
            createdAt: new Date(),
          },
          {
            id: "event-2",
            action: "MATCH_EVENT_GOAL",
            metadata: {
              registrationId: currentRegistrationId,
            },
            createdAt: new Date(),
          },
          {
            id: "event-3",
            action: "MATCH_EVENT_YELLOW_CARD",
            metadata: {
              registrationId: currentRegistrationId,
            },
            createdAt: new Date(),
          },
          {
            id: "event-other-player",
            action: "MATCH_EVENT_GOAL",
            metadata: {
              registrationId: "00000000-0000-0000-0000-999999999999",
            },
            createdAt: new Date(),
          },
        ]),
      },
    };

    const tenantAccess = {
      organizationScope: jest.fn().mockReturnValue(null),
    };

    const discipline = {
      getPlayerDisciplineState: jest.fn(
        async (_competitionId: string, registrationId: string) => ({
          competitionId,
          registrationId,
          yellowCards: registrationId === currentRegistrationId ? 1 : 0,
          redCards: 0,
          activeSuspension:
            registrationId === currentRegistrationId
              ? {
                  matchesTotal: 2,
                  matchesServed: 1,
                  matchesRemaining: 1,
                  reason: "Cumul de cartons",
                  startedAt: new Date("2026-09-10"),
                }
              : null,
        }),
      ),
    };

    const service = new RegistriesService(
      prisma as never,
      tenantAccess as never,
      discipline as never,
    );

    const result = await service.getPlayer360(
      {
        userId: "00000000-0000-0000-0000-000000000001",
        memberships: [],
      },
      personId,
    );

    expect(result.competitions).toHaveLength(1);

    const competition = result.competitions[0];

    expect(competition.statistics).toEqual({
      goals: 2,
      yellowCards: 1,
      redCards: 0,
    });

    expect(competition.homologatedMatchesCount).toBe(2);

    expect(competition.discipline.activeSuspensions).toHaveLength(1);
    expect(competition.discipline.activeSuspensions[0].registrationId).toBe(
      currentRegistrationId,
    );
    expect(competition.discipline.activeSuspensions[0].matchesRemaining).toBe(
      1,
    );

    expect(discipline.getPlayerDisciplineState).toHaveBeenCalledTimes(2);
    expect(discipline.getPlayerDisciplineState).toHaveBeenCalledWith(
      competitionId,
      oldRegistrationId,
    );
    expect(discipline.getPlayerDisciplineState).toHaveBeenCalledWith(
      competitionId,
      currentRegistrationId,
    );
  });
});

describe("RegistriesService - Player 360 league index", () => {
  it("retourne une seule identité par joueur et signale les inscriptions actives multiples", async () => {
    const personId = "00000000-0000-0000-0000-000000000700";

    const prisma = {
      person: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: personId,
            firstName: "Paul",
            lastName: "Dossou",
            birthDate: new Date("2001-05-10"),
            nationality: "Béninoise",
            federationId: "FBF-001",
            registrations: [
              {
                id: "00000000-0000-0000-0000-000000000701",
                organizationId: "00000000-0000-0000-0000-000000000801",
                category: RegistrationCategory.PLAYER,
                status: RegistrationStatus.VALIDATED,
                startDate: new Date("2026-08-01"),
                endDate: null,
                createdAt: new Date("2026-08-01"),
                organization: {
                  id: "00000000-0000-0000-0000-000000000801",
                  name: "Dragons FC de l'Ouémé",
                  code: "DRAGONS",
                  club: {
                    id: "00000000-0000-0000-0000-000000000901",
                    shortName: "Dragons",
                    division: "LIGUE_1",
                    city: "Porto-Novo",
                  },
                },
                licenses: [],
              },
              {
                id: "00000000-0000-0000-0000-000000000702",
                organizationId: "00000000-0000-0000-0000-000000000802",
                category: RegistrationCategory.PLAYER,
                status: RegistrationStatus.VALIDATED,
                startDate: new Date("2026-09-01"),
                endDate: null,
                createdAt: new Date("2026-09-01"),
                organization: {
                  id: "00000000-0000-0000-0000-000000000802",
                  name: "Requins FC de l'Atlantique",
                  code: "REQUINS",
                  club: {
                    id: "00000000-0000-0000-0000-000000000902",
                    shortName: "Requins FC",
                    division: "LIGUE_1",
                    city: "Cotonou",
                  },
                },
                licenses: [],
              },
            ],
          },
        ]),
      },
    };

    const tenantAccess = {
      organizationScope: jest.fn().mockReturnValue(null),
    };

    const service = new RegistriesService(
      prisma as never,
      tenantAccess as never,
    );

    const result = await service.listPlayer360({
      userId: "00000000-0000-0000-0000-000000000001",
      memberships: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0].personId).toBe(personId);
    expect(result[0].registrations).toBe(2);
    expect(result[0].clubs).toBe(2);

    expect(result[0].dataQuality.multipleActiveRegistrations).toBe(true);

    expect(result[0].current).toBeNull();

    expect(prisma.person.findMany).toHaveBeenCalledTimes(1);
  });
});
