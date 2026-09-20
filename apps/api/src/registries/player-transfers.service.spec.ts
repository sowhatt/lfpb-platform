import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  LicenseStatus,
  OrganizationType,
  PlayerTransferStatus,
  RegistrationCategory,
  RegistrationStatus,
  Role,
} from "@prisma/client";
import { PlayerTransfersService } from "./player-transfers.service";

describe("PlayerTransfersService", () => {
  const actor = {
    userId: "11111111-1111-4111-8111-111111111111",
    email: "club@example.com",
    roles: [],
    memberships: [],
  } as any;

  const personId = "22222222-2222-4222-8222-222222222222";
  const sourceRegistrationId = "33333333-3333-4333-8333-333333333333";
  const sourceOrganizationId = "44444444-4444-4444-8444-444444444444";
  const targetOrganizationId = "55555555-5555-4555-8555-555555555555";

  const input = {
    personId,
    sourceRegistrationId,
    targetOrganizationId,
    requestedStartDate: "2026-10-01",
    seasonId: "99999999-9999-4999-8999-999999999999",
    reason: "Mutation sportive",
  };

  function makePrisma() {
    const tx = {
      playerTransfer: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: "66666666-6666-4666-8666-666666666666",
            ...data,
          }),
        ),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    return {
      registration: {
        findUnique: jest.fn().mockResolvedValue({
          id: sourceRegistrationId,
          personId,
          organizationId: sourceOrganizationId,
          category: RegistrationCategory.PLAYER,
          status: RegistrationStatus.VALIDATED,
          person: {
            id: personId,
            firstName: "Jean",
            lastName: "Joueur",
          },
          organization: {
            id: sourceOrganizationId,
            type: OrganizationType.CLUB,
            active: true,
            club: { id: "club-source" },
          },
          playerProfile: {
            position: "FORWARD",
          },
        }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          id: targetOrganizationId,
          type: OrganizationType.CLUB,
          active: true,
          club: { id: "club-target" },
        }),
      },
      playerTransfer: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      season: {
        findUnique: jest.fn().mockResolvedValue({
          id: input.seasonId,
          name: "2026-2027",
          startDate: new Date("2026-07-01T00:00:00.000Z"),
          endDate: new Date("2027-06-30T00:00:00.000Z"),
          status: "ACTIVE",
        }),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(tx)),
      __tx: tx,
    };
  }

  function makeTenantAccess() {
    return {
      assertOrganizationAccess: jest.fn(),
    };
  }

  it("crée un transfert DRAFT en conservant le personId", async () => {
    const prisma = makePrisma();
    const tenantAccess = makeTenantAccess();

    const service = new PlayerTransfersService(
      prisma as any,
      tenantAccess as any,
      {
        assertTransition: jest.fn(),
      } as any,
    );

    const result = await service.create(actor, input);

    expect(result.personId).toBe(personId);
    expect(result.status).toBe(PlayerTransferStatus.DRAFT);

    expect(tenantAccess.assertOrganizationAccess).toHaveBeenCalledWith(
      actor,
      targetOrganizationId,
    );

    expect(prisma.__tx.playerTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personId,
          sourceRegistrationId,
          sourceOrganizationId,
          targetOrganizationId,
          status: PlayerTransferStatus.DRAFT,
        }),
      }),
    );

    expect(prisma.__tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "PLAYER_TRANSFER_CREATED",
          resourceType: "PlayerTransfer",
        }),
      }),
    );
  });

  it("refuse si l'inscription source n'existe pas", async () => {
    const prisma = makePrisma();
    prisma.registration.findUnique.mockResolvedValue(null);

    const service = new PlayerTransfersService(
      prisma as any,
      makeTenantAccess() as any,
      {
        assertTransition: jest.fn(),
      } as any,
    );

    await expect(service.create(actor, input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("refuse si le personId ne correspond pas à l'inscription source", async () => {
    const prisma = makePrisma();

    prisma.registration.findUnique.mockResolvedValue({
      id: sourceRegistrationId,
      personId: "77777777-7777-4777-8777-777777777777",
      organizationId: sourceOrganizationId,
      category: RegistrationCategory.PLAYER,
      status: RegistrationStatus.VALIDATED,
      person: {},
      organization: {
        type: OrganizationType.CLUB,
        club: {},
      },
      playerProfile: {},
    });

    const service = new PlayerTransfersService(
      prisma as any,
      makeTenantAccess() as any,
      {
        assertTransition: jest.fn(),
      } as any,
    );

    await expect(service.create(actor, input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("refuse un transfert vers le même club", async () => {
    const prisma = makePrisma();

    const service = new PlayerTransfersService(
      prisma as any,
      makeTenantAccess() as any,
      {
        assertTransition: jest.fn(),
      } as any,
    );

    await expect(
      service.create(actor, {
        ...input,
        targetOrganizationId: sourceOrganizationId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse un club d'accueil inactif", async () => {
    const prisma = makePrisma();

    prisma.organization.findUnique.mockResolvedValue({
      id: targetOrganizationId,
      type: OrganizationType.CLUB,
      active: false,
      club: { id: "club-target" },
    });

    const service = new PlayerTransfersService(
      prisma as any,
      makeTenantAccess() as any,
      {
        assertTransition: jest.fn(),
      } as any,
    );

    await expect(service.create(actor, input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("refuse si le joueur possède déjà une inscription non archivée dans le club d'accueil", async () => {
    const prisma = makePrisma();

    prisma.registration.findFirst.mockResolvedValue({
      id: "88888888-8888-4888-8888-888888888888",
    });

    const service = new PlayerTransfersService(
      prisma as any,
      makeTenantAccess() as any,
      {
        assertTransition: jest.fn(),
      } as any,
    );

    await expect(service.create(actor, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("refuse un deuxième transfert simultané pour le même joueur", async () => {
    const prisma = makePrisma();

    prisma.playerTransfer.findFirst.mockResolvedValue({
      id: "99999999-9999-4999-8999-999999999999",
    });

    const service = new PlayerTransfersService(
      prisma as any,
      makeTenantAccess() as any,
      {
        assertTransition: jest.fn(),
      } as any,
    );

    await expect(service.create(actor, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("ne crée jamais une nouvelle Person lors d'un transfert", async () => {
    const prisma = makePrisma();

    const service = new PlayerTransfersService(
      prisma as any,
      makeTenantAccess() as any,
      {
        assertTransition: jest.fn(),
      } as any,
    );

    await service.create(actor, input);

    expect((prisma as any).person).toBeUndefined();
    expect(prisma.__tx.playerTransfer.create).toHaveBeenCalledTimes(1);
  });

  describe("create - saison", () => {
    it("refuse une saison inexistante", async () => {
      const prisma = makePrisma();
      prisma.season.findUnique.mockResolvedValue(null);

      const service = new PlayerTransfersService(
        prisma as any,
        makeTenantAccess() as any,
        {
          assertTransition: jest.fn(),
        } as any,
      );

      await expect(service.create(actor, input)).rejects.toThrow(
        "Saison introuvable",
      );

      expect(prisma.__tx.playerTransfer.create).not.toHaveBeenCalled();
    });

    it("refuse une date de prise d'effet hors de la saison", async () => {
      const prisma = makePrisma();

      prisma.season.findUnique.mockResolvedValue({
        id: input.seasonId,
        name: "2026-2027",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2027-06-30T00:00:00.000Z"),
        status: "ACTIVE",
      });

      const service = new PlayerTransfersService(
        prisma as any,
        makeTenantAccess() as any,
        {
          assertTransition: jest.fn(),
        } as any,
      );

      await expect(
        service.create(actor, {
          ...input,
          requestedStartDate: "2027-07-01",
        }),
      ).rejects.toThrow(
        "La date de prise d'effet du transfert doit appartenir à la saison sélectionnée",
      );

      expect(prisma.__tx.playerTransfer.create).not.toHaveBeenCalled();
    });
  });
});

describe("PlayerTransfersService submit", () => {
  const actor = {
    userId: "11111111-1111-4111-8111-111111111111",
    memberships: [],
  } as any;

  const transferId = "66666666-6666-4666-8666-666666666666";
  const personId = "22222222-2222-4222-8222-222222222222";
  const sourceOrganizationId = "44444444-4444-4444-8444-444444444444";
  const targetOrganizationId = "55555555-5555-4555-8555-555555555555";

  function makeSubmitContext(
    status: PlayerTransferStatus = PlayerTransferStatus.DRAFT,
  ) {
    const transfer = {
      id: transferId,
      personId,
      sourceOrganizationId,
      targetOrganizationId,
      status,
    };

    const tx = {
      playerTransfer: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      playerTransfer: {
        findUnique: jest.fn().mockResolvedValue(transfer),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(tx)),
      __tx: tx,
    };

    const tenantAccess = {
      assertOrganizationAccess: jest.fn(),
    };

    const transferStatus = {
      assertTransition: jest.fn(),
    };

    const service = new PlayerTransfersService(
      prisma as any,
      tenantAccess as any,
      transferStatus as any,
    );

    return {
      service,
      prisma,
      tenantAccess,
      transferStatus,
      tx,
    };
  }

  it("soumet un transfert DRAFT en REQUESTED", async () => {
    const ctx = makeSubmitContext();

    const result = await ctx.service.submit(actor, transferId);

    expect(ctx.tenantAccess.assertOrganizationAccess).toHaveBeenCalledWith(
      actor,
      targetOrganizationId,
    );

    expect(ctx.transferStatus.assertTransition).toHaveBeenCalledWith(
      PlayerTransferStatus.DRAFT,
      PlayerTransferStatus.REQUESTED,
    );

    expect(ctx.tx.playerTransfer.updateMany).toHaveBeenCalledWith({
      where: {
        id: transferId,
        status: PlayerTransferStatus.DRAFT,
      },
      data: {
        status: PlayerTransferStatus.REQUESTED,
        requestedAt: expect.any(Date),
      },
    });

    expect(result.status).toBe(PlayerTransferStatus.REQUESTED);
    expect(result.requestedAt).toBeInstanceOf(Date);
  });

  it("refuse une soumission concurrente si le statut a changé", async () => {
    const ctx = makeSubmitContext();

    ctx.tx.playerTransfer.updateMany.mockResolvedValue({ count: 0 });

    await expect(ctx.service.submit(actor, transferId)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(ctx.tx.playerTransfer.updateMany).toHaveBeenCalledWith({
      where: {
        id: transferId,
        status: PlayerTransferStatus.DRAFT,
      },
      data: {
        status: PlayerTransferStatus.REQUESTED,
        requestedAt: expect.any(Date),
      },
    });

    expect(ctx.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("audite la soumission", async () => {
    const ctx = makeSubmitContext();

    await ctx.service.submit(actor, transferId);

    expect(ctx.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: actor.userId,
        organizationId: targetOrganizationId,
        action: "PLAYER_TRANSFER_SUBMITTED",
        resourceType: "PlayerTransfer",
        resourceId: transferId,
        metadata: expect.objectContaining({
          personId,
          sourceOrganizationId,
          targetOrganizationId,
          fromStatus: PlayerTransferStatus.DRAFT,
          toStatus: PlayerTransferStatus.REQUESTED,
        }),
      }),
    });
  });

  it("refuse un transfert inexistant", async () => {
    const ctx = makeSubmitContext();

    ctx.prisma.playerTransfer.findUnique.mockResolvedValue(null);

    await expect(ctx.service.submit(actor, transferId)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(ctx.tenantAccess.assertOrganizationAccess).not.toHaveBeenCalled();

    expect(ctx.tx.playerTransfer.updateMany).not.toHaveBeenCalled();
  });

  it("refuse une nouvelle soumission si la transition est interdite", async () => {
    const ctx = makeSubmitContext(PlayerTransferStatus.REQUESTED);

    ctx.transferStatus.assertTransition.mockImplementation(() => {
      throw new BadRequestException("Transition de transfert interdite");
    });

    await expect(ctx.service.submit(actor, transferId)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(ctx.transferStatus.assertTransition).toHaveBeenCalledWith(
      PlayerTransferStatus.REQUESTED,
      PlayerTransferStatus.REQUESTED,
    );

    expect(ctx.tx.playerTransfer.updateMany).not.toHaveBeenCalled();
    expect(ctx.tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("PlayerTransfersService formerClubDecision", () => {
  const actor = {
    userId: "11111111-1111-4111-8111-111111111111",
    memberships: [],
  } as any;

  const transferId = "66666666-6666-4666-8666-666666666666";
  const personId = "22222222-2222-4222-8222-222222222222";
  const sourceOrganizationId = "44444444-4444-4444-8444-444444444444";
  const targetOrganizationId = "55555555-5555-4555-8555-555555555555";

  function makeDecisionContext(
    status: PlayerTransferStatus = PlayerTransferStatus.REQUESTED,
  ) {
    const transfer = {
      id: transferId,
      personId,
      sourceOrganizationId,
      targetOrganizationId,
      status,
    };

    const tx = {
      playerTransfer: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      playerTransfer: {
        findUnique: jest.fn().mockResolvedValue(transfer),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(tx)),
    };

    const tenantAccess = {
      assertOrganizationAccess: jest.fn(),
    };

    const transferStatus = {
      assertTransition: jest.fn(),
    };

    const service = new PlayerTransfersService(
      prisma as any,
      tenantAccess as any,
      transferStatus as any,
    );

    return {
      service,
      prisma,
      tenantAccess,
      transferStatus,
      tx,
    };
  }

  it("enregistre l'accord du club quitté", async () => {
    const ctx = makeDecisionContext();

    const result = await ctx.service.formerClubDecision(actor, transferId, {
      decision: PlayerTransferStatus.AGREED,
    });

    expect(ctx.tenantAccess.assertOrganizationAccess).toHaveBeenCalledWith(
      actor,
      sourceOrganizationId,
    );

    expect(ctx.transferStatus.assertTransition).toHaveBeenCalledWith(
      PlayerTransferStatus.REQUESTED,
      PlayerTransferStatus.AGREED,
    );

    expect(ctx.tx.playerTransfer.updateMany).toHaveBeenCalledWith({
      where: {
        id: transferId,
        status: PlayerTransferStatus.REQUESTED,
      },
      data: {
        status: PlayerTransferStatus.AGREED,
        formerClubReason: null,
        formerClubDecidedAt: expect.any(Date),
        formerClubDecidedByUserId: actor.userId,
      },
    });

    expect(result.status).toBe(PlayerTransferStatus.AGREED);
  });

  it("enregistre l'opposition motivée du club quitté", async () => {
    const ctx = makeDecisionContext();

    const result = await ctx.service.formerClubDecision(actor, transferId, {
      decision: PlayerTransferStatus.OPPOSED,
      reason: "Dossier contractuel à examiner",
    });

    expect(ctx.tx.playerTransfer.updateMany).toHaveBeenCalledWith({
      where: {
        id: transferId,
        status: PlayerTransferStatus.REQUESTED,
      },
      data: {
        status: PlayerTransferStatus.OPPOSED,
        formerClubReason: "Dossier contractuel à examiner",
        formerClubDecidedAt: expect.any(Date),
        formerClubDecidedByUserId: actor.userId,
      },
    });

    expect(result.status).toBe(PlayerTransferStatus.OPPOSED);
  });

  it("refuse une opposition sans motif", async () => {
    const ctx = makeDecisionContext();

    await expect(
      ctx.service.formerClubDecision(actor, transferId, {
        decision: PlayerTransferStatus.OPPOSED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ctx.tx.playerTransfer.updateMany).not.toHaveBeenCalled();
    expect(ctx.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuse une décision concurrente du club quitté", async () => {
    const ctx = makeDecisionContext();

    ctx.tx.playerTransfer.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      ctx.service.formerClubDecision(actor, transferId, {
        decision: PlayerTransferStatus.AGREED,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(ctx.tx.playerTransfer.updateMany).toHaveBeenCalledWith({
      where: {
        id: transferId,
        status: PlayerTransferStatus.REQUESTED,
      },
      data: {
        status: PlayerTransferStatus.AGREED,
        formerClubReason: null,
        formerClubDecidedAt: expect.any(Date),
        formerClubDecidedByUserId: actor.userId,
      },
    });

    expect(ctx.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("audite la décision du club quitté", async () => {
    const ctx = makeDecisionContext();

    await ctx.service.formerClubDecision(actor, transferId, {
      decision: PlayerTransferStatus.AGREED,
    });

    expect(ctx.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: actor.userId,
        organizationId: sourceOrganizationId,
        action: "PLAYER_TRANSFER_FORMER_CLUB_DECISION",
        resourceType: "PlayerTransfer",
        resourceId: transferId,
        metadata: expect.objectContaining({
          personId,
          sourceOrganizationId,
          targetOrganizationId,
          fromStatus: PlayerTransferStatus.REQUESTED,
          toStatus: PlayerTransferStatus.AGREED,
        }),
      }),
    });
  });

  it("refuse une deuxième décision du club quitté", async () => {
    const ctx = makeDecisionContext(PlayerTransferStatus.AGREED);

    ctx.transferStatus.assertTransition.mockImplementation(() => {
      throw new BadRequestException("Transition de transfert interdite");
    });

    await expect(
      ctx.service.formerClubDecision(actor, transferId, {
        decision: PlayerTransferStatus.OPPOSED,
        reason: "Nouvelle opposition",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ctx.transferStatus.assertTransition).toHaveBeenCalledWith(
      PlayerTransferStatus.AGREED,
      PlayerTransferStatus.OPPOSED,
    );

    expect(ctx.tx.playerTransfer.updateMany).not.toHaveBeenCalled();
    expect(ctx.tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("PlayerTransfersService startLeagueReview", () => {
  const leagueActor = {
    userId: "11111111-1111-4111-8111-111111111111",
    memberships: [
      {
        organizationId: "77777777-7777-4777-8777-777777777777",
        role: Role.LIGUE_ADMIN,
      },
    ],
  } as any;

  const clubActor = {
    userId: "88888888-8888-4888-8888-888888888888",
    memberships: [
      {
        organizationId: "55555555-5555-4555-8555-555555555555",
        role: Role.CLUB_ADMIN,
      },
    ],
  } as any;

  const transferId = "66666666-6666-4666-8666-666666666666";
  const personId = "22222222-2222-4222-8222-222222222222";
  const sourceOrganizationId = "44444444-4444-4444-8444-444444444444";
  const targetOrganizationId = "55555555-5555-4555-8555-555555555555";

  function makeLeagueReviewContext(status: PlayerTransferStatus) {
    const transfer = {
      id: transferId,
      personId,
      sourceOrganizationId,
      targetOrganizationId,
      status,
    };

    const tx = {
      playerTransfer: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      playerTransfer: {
        findUnique: jest.fn().mockResolvedValue(transfer),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(tx)),
    };

    const tenantAccess = {
      assertOrganizationAccess: jest.fn(),
    };

    const transferStatus = {
      assertTransition: jest.fn(),
    };

    const service = new PlayerTransfersService(
      prisma as any,
      tenantAccess as any,
      transferStatus as any,
    );

    return {
      service,
      prisma,
      transferStatus,
      tx,
    };
  }

  it("permet à la Ligue de prendre en charge un transfert accepté", async () => {
    const ctx = makeLeagueReviewContext(PlayerTransferStatus.AGREED);

    const result = await ctx.service.startLeagueReview(leagueActor, transferId);

    expect(ctx.transferStatus.assertTransition).toHaveBeenCalledWith(
      PlayerTransferStatus.AGREED,
      PlayerTransferStatus.LEAGUE_REVIEW,
    );

    expect(ctx.tx.playerTransfer.updateMany).toHaveBeenCalledWith({
      where: {
        id: transferId,
        status: PlayerTransferStatus.AGREED,
      },
      data: {
        status: PlayerTransferStatus.LEAGUE_REVIEW,
        leagueReviewedAt: expect.any(Date),
        leagueReviewedByUserId: leagueActor.userId,
      },
    });

    expect(result.status).toBe(PlayerTransferStatus.LEAGUE_REVIEW);
  });

  it("permet à la Ligue d'examiner aussi une opposition", async () => {
    const ctx = makeLeagueReviewContext(PlayerTransferStatus.OPPOSED);

    await ctx.service.startLeagueReview(leagueActor, transferId);

    expect(ctx.transferStatus.assertTransition).toHaveBeenCalledWith(
      PlayerTransferStatus.OPPOSED,
      PlayerTransferStatus.LEAGUE_REVIEW,
    );

    expect(ctx.tx.playerTransfer.updateMany).toHaveBeenCalled();
  });

  it("interdit la prise en charge Ligue à un administrateur de club", async () => {
    const ctx = makeLeagueReviewContext(PlayerTransferStatus.AGREED);

    await expect(
      ctx.service.startLeagueReview(clubActor, transferId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(ctx.prisma.playerTransfer.findUnique).not.toHaveBeenCalled();
    expect(ctx.tx.playerTransfer.updateMany).not.toHaveBeenCalled();
  });

  it("refuse de sauter directement de REQUESTED à LEAGUE_REVIEW", async () => {
    const ctx = makeLeagueReviewContext(PlayerTransferStatus.REQUESTED);

    ctx.transferStatus.assertTransition.mockImplementation(() => {
      throw new BadRequestException("Transition de transfert interdite");
    });

    await expect(
      ctx.service.startLeagueReview(leagueActor, transferId),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ctx.transferStatus.assertTransition).toHaveBeenCalledWith(
      PlayerTransferStatus.REQUESTED,
      PlayerTransferStatus.LEAGUE_REVIEW,
    );

    expect(ctx.tx.playerTransfer.updateMany).not.toHaveBeenCalled();
  });

  it("refuse une prise en charge Ligue concurrente", async () => {
    const ctx = makeLeagueReviewContext(PlayerTransferStatus.AGREED);

    ctx.tx.playerTransfer.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      ctx.service.startLeagueReview(leagueActor, transferId),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(ctx.tx.playerTransfer.updateMany).toHaveBeenCalledWith({
      where: {
        id: transferId,
        status: PlayerTransferStatus.AGREED,
      },
      data: {
        status: PlayerTransferStatus.LEAGUE_REVIEW,
        leagueReviewedAt: expect.any(Date),
        leagueReviewedByUserId: leagueActor.userId,
      },
    });

    expect(ctx.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("audite la prise en charge par la Ligue", async () => {
    const ctx = makeLeagueReviewContext(PlayerTransferStatus.AGREED);

    await ctx.service.startLeagueReview(leagueActor, transferId);

    expect(ctx.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: leagueActor.userId,
        action: "PLAYER_TRANSFER_LEAGUE_REVIEW_STARTED",
        resourceType: "PlayerTransfer",
        resourceId: transferId,
        metadata: expect.objectContaining({
          personId,
          sourceOrganizationId,
          targetOrganizationId,
          fromStatus: PlayerTransferStatus.AGREED,
          toStatus: PlayerTransferStatus.LEAGUE_REVIEW,
        }),
      }),
    });
  });
});

describe("PlayerTransfersService leagueDecision", () => {
  const leagueActor = {
    userId: "11111111-1111-4111-8111-111111111111",
    memberships: [
      {
        organizationId: "77777777-7777-4777-8777-777777777777",
        role: Role.LIGUE_ADMIN,
      },
    ],
  } as any;

  const clubActor = {
    userId: "88888888-8888-4888-8888-888888888888",
    memberships: [
      {
        organizationId: "55555555-5555-4555-8555-555555555555",
        role: Role.CLUB_ADMIN,
      },
    ],
  } as any;

  const transferId = "66666666-6666-4666-8666-666666666666";

  function makeLeagueDecisionContext(
    status: PlayerTransferStatus = PlayerTransferStatus.LEAGUE_REVIEW,
  ) {
    const transfer = {
      id: transferId,
      personId: "22222222-2222-4222-8222-222222222222",
      sourceOrganizationId: "44444444-4444-4444-8444-444444444444",
      targetOrganizationId: "55555555-5555-4555-8555-555555555555",
      status,
    };

    const tx = {
      playerTransfer: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      playerTransfer: {
        findUnique: jest.fn().mockResolvedValue(transfer),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(tx)),
    };

    const transferStatus = {
      assertTransition: jest.fn(),
    };

    const service = new PlayerTransfersService(
      prisma as any,
      { assertOrganizationAccess: jest.fn() } as any,
      transferStatus as any,
    );

    return { service, prisma, transferStatus, tx };
  }

  it("permet à la Ligue d'approuver un transfert", async () => {
    const ctx = makeLeagueDecisionContext();

    const result = await ctx.service.leagueDecision(leagueActor, transferId, {
      decision: PlayerTransferStatus.APPROVED,
    });

    expect(ctx.transferStatus.assertTransition).toHaveBeenCalledWith(
      PlayerTransferStatus.LEAGUE_REVIEW,
      PlayerTransferStatus.APPROVED,
    );

    expect(ctx.tx.playerTransfer.updateMany).toHaveBeenCalledWith({
      where: {
        id: transferId,
        status: PlayerTransferStatus.LEAGUE_REVIEW,
      },
      data: {
        status: PlayerTransferStatus.APPROVED,
        leagueReason: null,
        leagueDecidedAt: expect.any(Date),
        leagueDecidedByUserId: leagueActor.userId,
      },
    });

    expect(result.status).toBe(PlayerTransferStatus.APPROVED);
  });

  it("permet à la Ligue de rejeter un transfert avec motif", async () => {
    const ctx = makeLeagueDecisionContext();

    const result = await ctx.service.leagueDecision(leagueActor, transferId, {
      decision: PlayerTransferStatus.REJECTED,
      reason: "Pièces justificatives insuffisantes",
    });

    expect(result.status).toBe(PlayerTransferStatus.REJECTED);
    expect(result.leagueReason).toBe("Pièces justificatives insuffisantes");
  });

  it("refuse un rejet sans motif", async () => {
    const ctx = makeLeagueDecisionContext();

    await expect(
      ctx.service.leagueDecision(leagueActor, transferId, {
        decision: PlayerTransferStatus.REJECTED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ctx.tx.playerTransfer.updateMany).not.toHaveBeenCalled();
    expect(ctx.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("interdit la décision à un administrateur de club", async () => {
    const ctx = makeLeagueDecisionContext();

    await expect(
      ctx.service.leagueDecision(clubActor, transferId, {
        decision: PlayerTransferStatus.APPROVED,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(ctx.prisma.playerTransfer.findUnique).not.toHaveBeenCalled();
    expect(ctx.tx.playerTransfer.updateMany).not.toHaveBeenCalled();
  });

  it("refuse une décision concurrente", async () => {
    const ctx = makeLeagueDecisionContext();

    ctx.tx.playerTransfer.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      ctx.service.leagueDecision(leagueActor, transferId, {
        decision: PlayerTransferStatus.APPROVED,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(ctx.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("audite la décision finale de la Ligue", async () => {
    const ctx = makeLeagueDecisionContext();

    await ctx.service.leagueDecision(leagueActor, transferId, {
      decision: PlayerTransferStatus.APPROVED,
    });

    expect(ctx.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: leagueActor.userId,
        action: "PLAYER_TRANSFER_LEAGUE_DECISION",
        resourceType: "PlayerTransfer",
        resourceId: transferId,
        metadata: expect.objectContaining({
          fromStatus: PlayerTransferStatus.LEAGUE_REVIEW,
          toStatus: PlayerTransferStatus.APPROVED,
        }),
      }),
    });
  });
});

describe("PlayerTransfersService makeEffective", () => {
  const leagueActor = {
    userId: "11111111-1111-4111-8111-111111111111",
    memberships: [
      {
        organizationId: "77777777-7777-4777-8777-777777777777",
        role: Role.LIGUE_ADMIN,
      },
    ],
  } as any;

  const clubActor = {
    userId: "88888888-8888-4888-8888-888888888888",
    memberships: [
      {
        organizationId: "55555555-5555-4555-8555-555555555555",
        role: Role.CLUB_ADMIN,
      },
    ],
  } as any;

  const transferId = "66666666-6666-4666-8666-666666666666";
  const personId = "22222222-2222-4222-8222-222222222222";
  const sourceOrganizationId = "44444444-4444-4444-8444-444444444444";
  const targetOrganizationId = "55555555-5555-4555-8555-555555555555";

  function makeEffectiveContext(options: any = {}) {
    const sourceRegistration = {
      id: "33333333-3333-4333-8333-333333333333",
      personId,
      organizationId: sourceOrganizationId,
      category: RegistrationCategory.PLAYER,
      status: RegistrationStatus.VALIDATED,
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: null,
      playerProfile: {
        position: "FORWARD",
        shirtName: "JOUEUR",
        shirtNumber: 9,
      },
      licenses: [],
      ...options.sourceRegistration,
    };

    const transfer = {
      id: transferId,
      personId,
      sourceRegistrationId: sourceRegistration.id,
      sourceOrganizationId,
      targetOrganizationId,
      targetRegistrationId: null,
      status: PlayerTransferStatus.APPROVED,
      requestedStartDate: new Date("2026-09-15T00:00:00.000Z"),
      seasonId: "99999999-9999-4999-8999-999999999999",
      season: {
        id: "99999999-9999-4999-8999-999999999999",
        name: "2026-2027",
      },
      sourceRegistration,
      ...options.transfer,
    };

    const targetRegistration = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      personId,
      organizationId: targetOrganizationId,
      category: RegistrationCategory.PLAYER,
      status: RegistrationStatus.DRAFT,
      startDate: transfer.requestedStartDate,
      endDate: null,
      playerProfile: {
        position: sourceRegistration.playerProfile?.position ?? "FORWARD",
        shirtName: sourceRegistration.playerProfile?.shirtName ?? null,
        shirtNumber: null,
      },
      licenses: [],
      documents: [],
    };

    const targetLicense = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      registrationId: targetRegistration.id,
      season: transfer.season.name,
      status: LicenseStatus.DRAFT,
    };

    const tx = {
      playerTransfer: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({
            count: options.transferClaimCount ?? 1,
          })
          .mockResolvedValueOnce({
            count: options.transferLinkCount ?? 1,
          }),
      },
      registration: {
        updateMany: jest.fn().mockResolvedValue({
          count: options.sourceCloseCount ?? 1,
        }),
        create: jest.fn().mockResolvedValue(targetRegistration),
      },
      license: {
        updateMany: jest.fn().mockResolvedValue({
          count: options.licenseCancelCount ?? 1,
        }),
        create: jest.fn().mockResolvedValue(targetLicense),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      playerTransfer: {
        findUnique: jest.fn().mockResolvedValue(transfer),
      },
      registration: {
        findFirst: jest
          .fn()
          .mockResolvedValue(options.existingTargetRegistration ?? null),
      },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };

    const transferStatus = {
      assertTransition: jest.fn(),
    };

    const service = new PlayerTransfersService(
      prisma as any,
      { assertOrganizationAccess: jest.fn() } as any,
      transferStatus as any,
    );

    return {
      service,
      prisma,
      tx,
      transferStatus,
      transfer,
      sourceRegistration,
      targetRegistration,
      targetLicense,
    };
  }

  it("valide un transfert APPROVED prêt à devenir effectif", async () => {
    const ctx = makeEffectiveContext();

    const result = await ctx.service.makeEffective(leagueActor, transferId);

    expect(ctx.transferStatus.assertTransition).toHaveBeenCalledWith(
      PlayerTransferStatus.APPROVED,
      PlayerTransferStatus.EFFECTIVE,
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: transferId,
        personId,
        status: PlayerTransferStatus.EFFECTIVE,
        targetRegistrationId: ctx.targetRegistration.id,
        targetRegistration: ctx.targetRegistration,
        targetLicense: ctx.targetLicense,
        effectiveAt: expect.any(Date),
      }),
    );
  });

  it("interdit l'effectivité à un administrateur de club", async () => {
    const ctx = makeEffectiveContext();

    await expect(
      ctx.service.makeEffective(clubActor, transferId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(ctx.prisma.playerTransfer.findUnique).not.toHaveBeenCalled();
  });

  it("refuse une inscription source appartenant à un autre joueur", async () => {
    const ctx = makeEffectiveContext({
      sourceRegistration: {
        personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    });

    await expect(
      ctx.service.makeEffective(leagueActor, transferId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuse une inscription source déjà archivée", async () => {
    const ctx = makeEffectiveContext({
      sourceRegistration: {
        status: RegistrationStatus.ARCHIVED,
      },
    });

    await expect(
      ctx.service.makeEffective(leagueActor, transferId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuse si une inscription cible existe déjà", async () => {
    const ctx = makeEffectiveContext({
      existingTargetRegistration: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    });

    await expect(
      ctx.service.makeEffective(leagueActor, transferId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuse une licence source encore en cours de traitement", async () => {
    const ctx = makeEffectiveContext({
      sourceRegistration: {
        licenses: [
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            status: LicenseStatus.SUBMITTED_TO_LEAGUE,
          },
        ],
      },
    });

    await expect(
      ctx.service.makeEffective(leagueActor, transferId),
    ).rejects.toThrow(
      "La licence source SUBMITTED_TO_LEAGUE doit être régularisée avant de rendre le transfert effectif",
    );
  });

  it("accepte une licence FBF délivrée qui pourra être annulée", async () => {
    const ctx = makeEffectiveContext({
      sourceRegistration: {
        licenses: [
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            status: LicenseStatus.ISSUED_BY_FBF,
          },
        ],
      },
    });

    await expect(
      ctx.service.makeEffective(leagueActor, transferId),
    ).resolves.toEqual(
      expect.objectContaining({
        status: PlayerTransferStatus.EFFECTIVE,
        targetRegistrationId: expect.any(String),
      }),
    );
  });

  it("accepte une licence source déjà expirée", async () => {
    const ctx = makeEffectiveContext({
      sourceRegistration: {
        licenses: [
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            status: LicenseStatus.EXPIRED,
          },
        ],
      },
    });

    await expect(
      ctx.service.makeEffective(leagueActor, transferId),
    ).resolves.toEqual(
      expect.objectContaining({
        status: PlayerTransferStatus.EFFECTIVE,
        targetRegistrationId: expect.any(String),
      }),
    );
  });

  it("conserve le même personId et crée la nouvelle inscription à la date du transfert", async () => {
    const ctx = makeEffectiveContext();

    await ctx.service.makeEffective(leagueActor, transferId);

    expect(ctx.tx.registration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personId,
          organizationId: targetOrganizationId,
          category: RegistrationCategory.PLAYER,
          status: RegistrationStatus.DRAFT,
          startDate: new Date("2026-09-15T00:00:00.000Z"),
        }),
      }),
    );
  });

  it("archive l'inscription source à J-1", async () => {
    const ctx = makeEffectiveContext();

    await ctx.service.makeEffective(leagueActor, transferId);

    expect(ctx.tx.registration.updateMany).toHaveBeenCalledWith({
      where: {
        id: ctx.sourceRegistration.id,
        personId,
        organizationId: sourceOrganizationId,
        status: RegistrationStatus.VALIDATED,
      },
      data: {
        status: RegistrationStatus.ARCHIVED,
        endDate: new Date("2026-09-14T00:00:00.000Z"),
      },
    });
  });

  it("ne transfère pas automatiquement le numéro de maillot", async () => {
    const ctx = makeEffectiveContext();

    await ctx.service.makeEffective(leagueActor, transferId);

    const call = ctx.tx.registration.create.mock.calls[0][0];

    expect(call.data.playerProfile.create).toEqual({
      position: "FORWARD",
      shirtName: "JOUEUR",
    });

    expect(call.data.playerProfile.create).not.toHaveProperty("shirtNumber");
  });

  it("crée une nouvelle licence DRAFT pour la saison du transfert", async () => {
    const ctx = makeEffectiveContext();

    await ctx.service.makeEffective(leagueActor, transferId);

    expect(ctx.tx.license.create).toHaveBeenCalledWith({
      data: {
        registrationId: ctx.targetRegistration.id,
        season: "2026-2027",
        status: LicenseStatus.DRAFT,
      },
    });
  });

  it("annule une licence FBF délivrée lors de l'effectivité", async () => {
    const licenseId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    const ctx = makeEffectiveContext({
      sourceRegistration: {
        licenses: [
          {
            id: licenseId,
            status: LicenseStatus.ISSUED_BY_FBF,
          },
        ],
      },
    });

    await ctx.service.makeEffective(leagueActor, transferId);

    expect(ctx.tx.license.updateMany).toHaveBeenCalledWith({
      where: {
        id: licenseId,
        status: LicenseStatus.ISSUED_BY_FBF,
      },
      data: {
        status: LicenseStatus.CANCELLED,
      },
    });
  });

  it("ne modifie pas une licence source déjà expirée", async () => {
    const ctx = makeEffectiveContext({
      sourceRegistration: {
        licenses: [
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            status: LicenseStatus.EXPIRED,
          },
        ],
      },
    });

    await ctx.service.makeEffective(leagueActor, transferId);

    expect(ctx.tx.license.updateMany).not.toHaveBeenCalled();
  });

  it("bloque une inscription source SUBMITTED", async () => {
    const ctx = makeEffectiveContext({
      sourceRegistration: {
        status: RegistrationStatus.SUBMITTED,
      },
    });

    await expect(
      ctx.service.makeEffective(leagueActor, transferId),
    ).rejects.toThrow(
      "L'inscription source SUBMITTED ne peut pas être clôturée pour ce transfert",
    );

    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("bloque une double effectivité concurrente au premier CAS", async () => {
    const ctx = makeEffectiveContext({
      transferClaimCount: 0,
    });

    await expect(
      ctx.service.makeEffective(leagueActor, transferId),
    ).rejects.toThrow("Le transfert a été modifié par une autre opération");

    expect(ctx.tx.registration.updateMany).not.toHaveBeenCalled();
    expect(ctx.tx.registration.create).not.toHaveBeenCalled();
    expect(ctx.tx.license.create).not.toHaveBeenCalled();
    expect(ctx.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("détecte une modification concurrente de l'inscription source", async () => {
    const ctx = makeEffectiveContext({
      sourceCloseCount: 0,
    });

    await expect(
      ctx.service.makeEffective(leagueActor, transferId),
    ).rejects.toThrow(
      "L'inscription source a été modifiée par une autre opération",
    );

    expect(ctx.tx.registration.create).not.toHaveBeenCalled();
    expect(ctx.tx.license.create).not.toHaveBeenCalled();
    expect(ctx.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("trace l'effectivité complète du transfert", async () => {
    const ctx = makeEffectiveContext();

    await ctx.service.makeEffective(leagueActor, transferId);

    expect(ctx.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: leagueActor.userId,
        action: "PLAYER_TRANSFER_EFFECTIVE",
        resourceType: "PlayerTransfer",
        resourceId: transferId,
        metadata: expect.objectContaining({
          personId,
          sourceRegistrationId: ctx.sourceRegistration.id,
          targetRegistrationId: ctx.targetRegistration.id,
          sourceOrganizationId,
          targetOrganizationId,
        }),
      }),
    });
  });
});
