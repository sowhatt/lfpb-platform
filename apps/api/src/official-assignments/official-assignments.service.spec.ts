import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import {
  MatchOfficialAssignmentStatus,
  MatchOfficialRole,
  Role,
} from "@prisma/client";
import { OfficialAssignmentsService } from "./official-assignments.service";

describe("OfficialAssignmentsService", () => {
  const prisma = {
    officialProfile: { findUnique: jest.fn() },
    match: { findUnique: jest.fn() },
    matchOfficialAssignment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new OfficialAssignmentsService(prisma as never);
  const leagueActor = {
    userId: "10000000-0000-4000-8000-000000000001",
    memberships: [
      {
        organizationId: "20000000-0000-4000-8000-000000000001",
        role: Role.LIGUE_ADMIN,
      },
    ],
  };
  const officialActor = {
    userId: "10000000-0000-4000-8000-000000000002",
    memberships: [
      {
        organizationId: "20000000-0000-4000-8000-000000000001",
        role: Role.OFFICIEL,
      },
    ],
  };

  beforeEach(() => jest.clearAllMocks());

  it("crée une désignation en brouillon lorsqu’il n’existe aucun conflit", async () => {
    prisma.match.findUnique.mockResolvedValue({
      id: "match",
      kickoffAt: new Date("2026-09-26T15:00:00Z"),
    });
    prisma.officialProfile.findUnique.mockResolvedValue({
      registrationId: "official",
    });
    prisma.matchOfficialAssignment.findFirst.mockResolvedValue(null);
    prisma.matchOfficialAssignment.create.mockResolvedValue({
      id: "assignment",
      status: "DRAFT",
    });
    await expect(
      service.create(leagueActor, {
        matchId: "match",
        officialProfileId: "official",
        role: MatchOfficialRole.REFEREE,
      }),
    ).resolves.toMatchObject({ status: "DRAFT" });
  });

  it("bloque une double désignation dans une fenêtre de six heures", async () => {
    prisma.match.findUnique.mockResolvedValue({
      id: "match",
      kickoffAt: new Date("2026-09-26T15:00:00Z"),
    });
    prisma.officialProfile.findUnique.mockResolvedValue({
      registrationId: "official",
    });
    prisma.matchOfficialAssignment.findFirst.mockResolvedValue({
      id: "conflict",
    });
    await expect(
      service.create(leagueActor, {
        matchId: "match",
        officialProfileId: "official",
        role: MatchOfficialRole.REFEREE,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("impose un motif lorsqu’un officiel refuse", async () => {
    prisma.officialProfile.findUnique.mockResolvedValue({
      registrationId: "official",
    });
    prisma.matchOfficialAssignment.findUnique.mockResolvedValue({
      id: "assignment",
      officialProfileId: "official",
      status: MatchOfficialAssignmentStatus.SENT,
    });
    await expect(
      service.respond(officialActor, "assignment", { decision: "REFUSED" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("empêche un compte officiel non lié de consulter des désignations", async () => {
    prisma.officialProfile.findUnique.mockResolvedValue(null);
    await expect(service.list(officialActor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
