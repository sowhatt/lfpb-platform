import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { OrganizationType, Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { AuthenticatedActor } from "../iam/domain/actor";
import { TenantAccessService } from "../iam/tenant-access.service";
import { CreateClubDto } from "./dto/create-club.dto";
import { RenameClubDto } from "./dto/rename-club.dto";
import { UpdateClubDto } from "./dto/update-club.dto";
import { UpdateClubStatusDto } from "./dto/update-club-status.dto";
import { UpsertClubSeasonDto } from "./dto/upsert-club-season.dto";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async listFor(actor: AuthenticatedActor) {
    const scope = this.tenantAccess.organizationScope(actor);
    const isLeagueAdmin = actor.memberships.some(
      (membership) => membership.role === "LIGUE_ADMIN",
    );

    return this.prisma.organization.findMany({
      where: scope
        ? { id: { in: scope }, active: true }
        : isLeagueAdmin
          ? {}
          : { active: true },
      include: { club: true },
      orderBy: { name: "asc" },
    });
  }

  async findOneFor(actor: AuthenticatedActor, organizationId: string) {
    this.tenantAccess.assertOrganizationAccess(actor, organizationId);

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: {
        club: {
          include: {
            seasons: {
              include: { season: true },
              orderBy: { season: { startDate: "desc" } },
            },
            historyEvents: {
              include: {
                actor: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
              orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
            },
          },
        },
      },
    });

    if (!organization.club) {
      return organization;
    }

    const seasons = organization.club.seasons;

    const sportingSummary = {
      totalSeasons: seasons.length,
      league1Seasons: seasons.filter((entry) => entry.division === "LIGUE_1")
        .length,
      league2Seasons: seasons.filter((entry) => entry.division === "LIGUE_2")
        .length,
      titles: seasons.filter((entry) => entry.finalRank === 1).length,
      promotions: seasons.filter((entry) => entry.outcome === "PROMOTED")
        .length,
      relegations: seasons.filter((entry) => entry.outcome === "RELEGATED")
        .length,
    };

    return {
      ...organization,
      club: {
        ...organization.club,
        sportingSummary,
      },
    };
  }

  async updateClub(
    actor: AuthenticatedActor,
    organizationId: string,
    input: UpdateClubDto,
  ) {
    this.tenantAccess.assertOrganizationAccess(actor, organizationId);

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: { club: true },
    });

    if (!organization.club) {
      throw new ConflictException("L'organisation n'est pas un club");
    }

    const shortName =
      input.shortName !== undefined ? input.shortName.trim() : undefined;
    const city = input.city !== undefined ? input.city.trim() : undefined;
    const colors = input.colors !== undefined ? input.colors.trim() : undefined;

    const changes: Array<{
      type: "SHORT_NAME_CHANGED" | "CITY_CHANGED" | "COLORS_CHANGED";
      title: string;
      previousValue: string | null;
      newValue: string;
    }> = [];

    if (shortName !== undefined && shortName !== organization.club.shortName) {
      changes.push({
        type: "SHORT_NAME_CHANGED",
        title: "Modification du nom court",
        previousValue: organization.club.shortName,
        newValue: shortName,
      });
    }

    if (city !== undefined && city !== (organization.club.city ?? "")) {
      changes.push({
        type: "CITY_CHANGED",
        title: "Modification de la ville",
        previousValue: organization.club.city,
        newValue: city,
      });
    }

    if (colors !== undefined && colors !== (organization.club.colors ?? "")) {
      changes.push({
        type: "COLORS_CHANGED",
        title: "Modification des couleurs",
        previousValue: organization.club.colors,
        newValue: colors,
      });
    }

    if (changes.length === 0) {
      return organization;
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.organization.update({
        where: { id: organizationId },
        data: {
          club: {
            update: {
              ...(shortName !== undefined ? { shortName } : {}),
              ...(city !== undefined ? { city } : {}),
              ...(colors !== undefined ? { colors } : {}),
            },
          },
        },
        include: { club: true },
      });

      const effectiveDate = new Date();

      for (const change of changes) {
        await tx.clubHistoryEvent.create({
          data: {
            clubId: organization.club!.id,
            type: change.type,
            effectiveDate,
            title: change.title,
            previousValue: change.previousValue,
            newValue: change.newValue,
            actorUserId: actor.userId,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId,
          action: "CLUB_UPDATED",
          resourceType: "Club",
          resourceId: organization.club!.id,
          metadata: {
            changes: changes.map((change) => ({
              type: change.type,
              previousValue: change.previousValue,
              newValue: change.newValue,
            })),
          },
        },
      });

      return updated;
    });
  }

  async renameClub(
    actor: AuthenticatedActor,
    organizationId: string,
    input: RenameClubDto,
  ) {
    this.tenantAccess.assertOrganizationAccess(actor, organizationId);

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: { club: true },
    });

    if (!organization.club) {
      throw new ConflictException("L'organisation n'est pas un club");
    }

    const newName = input.name.trim();
    const reason = input.reason.trim();

    if (newName === organization.name) {
      return organization;
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.organization.update({
        where: { id: organizationId },
        data: { name: newName },
        include: { club: true },
      });

      await tx.clubHistoryEvent.create({
        data: {
          clubId: organization.club!.id,
          type: "RENAMED",
          effectiveDate: new Date(input.effectiveDate),
          title: "Changement de nom officiel",
          previousValue: organization.name,
          newValue: newName,
          reason,
          actorUserId: actor.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId,
          action: "CLUB_RENAMED",
          resourceType: "Club",
          resourceId: organization.club!.id,
          metadata: {
            previousName: organization.name,
            newName,
            effectiveDate: input.effectiveDate,
            reason,
          },
        },
      });

      return updated;
    });
  }

  async updateClubStatus(
    actor: AuthenticatedActor,
    organizationId: string,
    input: UpdateClubStatusDto,
  ) {
    this.tenantAccess.assertOrganizationAccess(actor, organizationId);

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: { club: true },
    });

    if (!organization.club) {
      throw new ConflictException("L'organisation n'est pas un club");
    }

    if (organization.active === input.active) {
      return organization;
    }

    const reason = input.reason?.trim() || undefined;
    const action = input.active ? "CLUB_ACTIVATED" : "CLUB_DEACTIVATED";
    const historyType = input.active ? "ACTIVATED" : "DEACTIVATED";
    const title = input.active ? "Activation du club" : "Désactivation du club";

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.organization.update({
        where: { id: organizationId },
        data: { active: input.active },
        include: { club: true },
      });

      await tx.clubHistoryEvent.create({
        data: {
          clubId: organization.club!.id,
          type: historyType,
          effectiveDate: new Date(),
          title,
          previousValue: organization.active ? "ACTIF" : "INACTIF",
          newValue: input.active ? "ACTIF" : "INACTIF",
          reason,
          actorUserId: actor.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId,
          action,
          resourceType: "Club",
          resourceId: organization.club!.id,
          metadata: {
            previousActive: organization.active,
            active: input.active,
            reason: reason ?? null,
          },
        },
      });

      return updated;
    });
  }

  async upsertClubSeason(
    actor: AuthenticatedActor,
    organizationId: string,
    seasonId: string,
    input: UpsertClubSeasonDto,
  ) {
    this.tenantAccess.assertOrganizationAccess(actor, organizationId);

    const [organization, season] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        include: { club: true },
      }),
      this.prisma.season.findUnique({
        where: { id: seasonId },
      }),
    ]);

    if (!organization) {
      throw new NotFoundException("Organisation introuvable");
    }

    if (!organization.club) {
      throw new BadRequestException("L'organisation n'est pas un club");
    }

    if (!season) {
      throw new NotFoundException("Saison introuvable");
    }

    const notes = input.notes?.trim() || null;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const clubSeason = await tx.clubSeason.upsert({
        where: {
          clubId_seasonId: {
            clubId: organization.club!.id,
            seasonId,
          },
        },
        create: {
          clubId: organization.club!.id,
          seasonId,
          division: input.division,
          finalRank: input.finalRank,
          outcome: input.outcome,
          notes,
        },
        update: {
          division: input.division,
          finalRank: input.finalRank,
          outcome: input.outcome,
          notes,
        },
        include: {
          season: true,
        },
      });

      if (
        season.status === "ACTIVE" &&
        organization.club!.division !== input.division
      ) {
        await tx.club.update({
          where: { id: organization.club!.id },
          data: { division: input.division },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId,
          action: "CLUB_SEASON_UPSERTED",
          resourceType: "ClubSeason",
          resourceId: clubSeason.id,
          metadata: {
            clubId: organization.club!.id,
            seasonId,
            seasonName: season.name,
            seasonStatus: season.status,
            division: input.division,
            finalRank: input.finalRank ?? null,
            outcome: input.outcome ?? null,
          },
        },
      });

      return clubSeason;
    });
  }

  async createClub(actor: AuthenticatedActor, input: CreateClubDto) {
    const normalizedCode = input.code.trim().toUpperCase();
    const name = input.name.trim();
    const shortName = input.shortName.trim();
    const city = input.city?.trim() || undefined;

    try {
      return await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const organization = await tx.organization.create({
            data: {
              name,
              code: normalizedCode,
              type: OrganizationType.CLUB,
              club: {
                create: {
                  shortName,
                  division: input.division,
                  city,
                },
              },
            },
            include: { club: true },
          });

          if (organization.club) {
            await tx.clubHistoryEvent.create({
              data: {
                clubId: organization.club.id,
                type: "CREATED",
                effectiveDate: new Date(),
                title: "Création du club",
                newValue: name,
                actorUserId: actor.userId,
                metadata: {
                  organizationId: organization.id,
                  code: normalizedCode,
                  shortName,
                  division: input.division,
                  city: city ?? null,
                },
              },
            });
          }

          await tx.auditLog.create({
            data: {
              actorUserId: actor.userId,
              organizationId: organization.id,
              action: "CLUB_CREATED",
              resourceType: "Club",
              resourceId: organization.club?.id ?? organization.id,
              metadata: {
                organizationId: organization.id,
                code: normalizedCode,
                name,
                shortName,
                division: input.division,
                city: city ?? null,
              },
            },
          });

          return organization;
        },
      );
    } catch (reason) {
      if (
        reason instanceof Prisma.PrismaClientKnownRequestError &&
        reason.code === "P2002"
      ) {
        throw new ConflictException(
          `Le code club ${normalizedCode} est déjà utilisé`,
        );
      }

      throw reason;
    }
  }
}
