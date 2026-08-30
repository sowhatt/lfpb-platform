import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MatchOfficialAssignmentStatus, Role } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { AuthenticatedActor } from "../iam/domain/actor";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";
import { RespondAssignmentDto } from "./dto/respond-assignment.dto";

const ACTIVE_STATUSES: MatchOfficialAssignmentStatus[] = [
  MatchOfficialAssignmentStatus.SENT,
  MatchOfficialAssignmentStatus.ACCEPTED,
];

@Injectable()
export class OfficialAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private isLeagueAdmin(actor: AuthenticatedActor) {
    return actor.memberships.some(
      (membership) => membership.role === Role.LIGUE_ADMIN,
    );
  }

  private async officialProfileId(actor: AuthenticatedActor) {
    const profile = await this.prisma.officialProfile.findUnique({
      where: { userId: actor.userId },
    });
    if (!profile)
      throw new ForbiddenException(
        "Aucun profil officiel n’est lié à ce compte",
      );
    return profile.registrationId;
  }

  async list(actor: AuthenticatedActor, matchId?: string) {
    const where = this.isLeagueAdmin(actor)
      ? { ...(matchId ? { matchId } : {}) }
      : {
          officialProfileId: await this.officialProfileId(actor),
          ...(matchId ? { matchId } : {}),
        };
    return this.prisma.matchOfficialAssignment.findMany({
      where,
      include: {
        match: {
          include: {
            homeClub: true,
            awayClub: true,
            venue: true,
            competition: true,
          },
        },
        officialProfile: {
          include: { registration: { include: { person: true } } },
        },
      },
      orderBy: [{ match: { kickoffAt: "asc" } }, { role: "asc" }],
    });
  }

  async create(actor: AuthenticatedActor, input: CreateAssignmentDto) {
    const match = await this.prisma.match.findUnique({
      where: { id: input.matchId },
    });
    if (!match) throw new NotFoundException("Match introuvable");
    if (!match.kickoffAt)
      throw new BadRequestException(
        "Le match doit avoir une date avant la désignation",
      );
    const official = await this.prisma.officialProfile.findUnique({
      where: { registrationId: input.officialProfileId },
    });
    if (!official) throw new NotFoundException("Officiel introuvable");

    const windowStart = new Date(
      match.kickoffAt.getTime() - 6 * 60 * 60 * 1000,
    );
    const windowEnd = new Date(match.kickoffAt.getTime() + 6 * 60 * 60 * 1000);
    const conflict = await this.prisma.matchOfficialAssignment.findFirst({
      where: {
        officialProfileId: input.officialProfileId,
        status: { in: ACTIVE_STATUSES },
        match: { kickoffAt: { gte: windowStart, lte: windowEnd } },
      },
    });
    if (conflict)
      throw new ConflictException(
        "Cet officiel a déjà une désignation proche de cet horaire",
      );

    try {
      return await this.prisma.matchOfficialAssignment.create({
        data: { ...input, createdByUserId: actor.userId },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "Ce rôle ou cet officiel est déjà affecté à ce match",
        );
      }
      throw error;
    }
  }

  async send(id: string) {
    const assignment = await this.prisma.matchOfficialAssignment.findUnique({
      where: { id },
    });
    if (!assignment) throw new NotFoundException("Désignation introuvable");
    if (assignment.status !== MatchOfficialAssignmentStatus.DRAFT) {
      throw new BadRequestException(
        "Seule une désignation en brouillon peut être envoyée",
      );
    }
    return this.prisma.matchOfficialAssignment.update({
      where: { id },
      data: { status: MatchOfficialAssignmentStatus.SENT, sentAt: new Date() },
    });
  }

  async respond(
    actor: AuthenticatedActor,
    id: string,
    input: RespondAssignmentDto,
  ) {
    const profileId = await this.officialProfileId(actor);
    const assignment = await this.prisma.matchOfficialAssignment.findUnique({
      where: { id },
    });
    if (!assignment || assignment.officialProfileId !== profileId)
      throw new NotFoundException("Désignation introuvable");
    if (assignment.status !== MatchOfficialAssignmentStatus.SENT) {
      throw new BadRequestException(
        "Cette désignation ne peut plus recevoir de réponse",
      );
    }
    if (input.decision === "REFUSED" && !input.reason) {
      throw new BadRequestException("Le motif est obligatoire en cas de refus");
    }
    return this.prisma.matchOfficialAssignment.update({
      where: { id },
      data: {
        status: input.decision,
        responseReason: input.reason,
        respondedAt: new Date(),
      },
    });
  }

  async cancel(id: string) {
    const assignment = await this.prisma.matchOfficialAssignment.findUnique({
      where: { id },
    });
    if (!assignment) throw new NotFoundException("Désignation introuvable");
    if (assignment.status === MatchOfficialAssignmentStatus.CANCELLED)
      return assignment;
    return this.prisma.matchOfficialAssignment.update({
      where: { id },
      data: { status: MatchOfficialAssignmentStatus.CANCELLED },
    });
  }
}
