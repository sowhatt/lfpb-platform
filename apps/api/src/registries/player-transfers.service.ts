import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  LicenseStatus,
  OrganizationType,
  PlayerTransferStatus,
  Prisma,
  RegistrationCategory,
  Role,
  RegistrationStatus,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { AuthenticatedActor } from "../iam/domain/actor";
import { TenantAccessService } from "../iam/tenant-access.service";
import { CreatePlayerTransferDto } from "./dto/create-player-transfer.dto";
import { FormerClubTransferDecisionDto } from "./dto/former-club-transfer-decision.dto";
import { LeagueTransferDecisionDto } from "./dto/league-transfer-decision.dto";
import { PlayerTransferStatusService } from "./player-transfer-status.service";

const OPEN_TRANSFER_STATUSES: PlayerTransferStatus[] = [
  PlayerTransferStatus.DRAFT,
  PlayerTransferStatus.REQUESTED,
  PlayerTransferStatus.AGREED,
  PlayerTransferStatus.OPPOSED,
  PlayerTransferStatus.LEAGUE_REVIEW,
  PlayerTransferStatus.APPROVED,
];

@Injectable()
export class PlayerTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
    private readonly transferStatus: PlayerTransferStatusService,
  ) {}

  private transferReadInclude = {
    person: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        nationality: true,
        federationId: true,
      },
    },
    season: true,
    sourceOrganization: {
      include: { club: true },
    },
    targetOrganization: {
      include: { club: true },
    },
    sourceRegistration: {
      include: {
        playerProfile: true,
        licenses: true,
      },
    },
    targetRegistration: {
      include: {
        playerProfile: true,
        licenses: true,
      },
    },
  } satisfies Prisma.PlayerTransferInclude;

  private transferReadScope(actor: AuthenticatedActor) {
    const isLeagueAdmin = actor.memberships.some(
      (membership) => membership.role === Role.LIGUE_ADMIN,
    );

    if (isLeagueAdmin) return {};

    const clubOrganizationIds = actor.memberships
      .filter((membership) => membership.role === Role.CLUB_ADMIN)
      .map((membership) => membership.organizationId);

    if (clubOrganizationIds.length === 0) {
      throw new ForbiddenException(
        "Vous n'avez pas accès aux transferts de joueurs",
      );
    }

    return {
      OR: [
        {
          sourceOrganizationId: {
            in: clubOrganizationIds,
          },
        },
        {
          targetOrganizationId: {
            in: clubOrganizationIds,
          },
        },
      ],
    };
  }

  async searchCandidates(actor: AuthenticatedActor, rawQuery: string) {
    const query = rawQuery?.trim() ?? "";

    if (query.length < 2) {
      throw new BadRequestException(
        "Saisissez au moins 2 caractères pour rechercher un joueur",
      );
    }

    const isLeagueAdmin = actor.memberships.some(
      (membership) => membership.role === Role.LIGUE_ADMIN,
    );

    const targetOrganizationIds = actor.memberships
      .filter((membership) => membership.role === Role.CLUB_ADMIN)
      .map((membership) => membership.organizationId);

    if (!isLeagueAdmin && targetOrganizationIds.length === 0) {
      throw new ForbiddenException(
        "Vous n'avez pas accès à la recherche de joueurs transférables",
      );
    }

    const people = await this.prisma.person.findMany({
      where: {
        AND: [
          {
            registrations: {
              some: {
                category: RegistrationCategory.PLAYER,
              },
            },
          },
          {
            OR: [
              {
                firstName: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                lastName: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                federationId: {
                  contains: query,
                  mode: "insensitive",
                },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        federationId: true,
        registrations: {
          where: {
            category: RegistrationCategory.PLAYER,
          },
          select: {
            id: true,
            organizationId: true,
            status: true,
            startDate: true,
            endDate: true,
            organization: {
              select: {
                id: true,
                name: true,
                code: true,
                club: {
                  select: {
                    shortName: true,
                  },
                },
              },
            },
            licenses: {
              orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
              select: {
                id: true,
                number: true,
                status: true,
                validFrom: true,
                validUntil: true,
              },
            },
          },
          orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 20,
    });

    const now = new Date();

    return people.map((person) => {
      const currentRegistrations = person.registrations.filter(
        (registration) =>
          registration.status !== RegistrationStatus.ARCHIVED &&
          registration.startDate <= now &&
          (!registration.endDate || registration.endDate >= now),
      );

      const currentRegistration =
        currentRegistrations.length === 1 ? currentRegistrations[0] : null;

      const currentLicense =
        currentRegistration?.licenses.find(
          (license) =>
            license.status !== LicenseStatus.CANCELLED &&
            license.status !== LicenseStatus.EXPIRED &&
            (!license.validFrom || license.validFrom <= now) &&
            (!license.validUntil || license.validUntil >= now),
        ) ?? null;

      const alreadyInTargetClub =
        !isLeagueAdmin &&
        currentRegistration !== null &&
        targetOrganizationIds.includes(currentRegistration.organizationId);

      let transferable = true;
      let blockingReason: string | null = null;

      if (currentRegistrations.length > 1) {
        transferable = false;
        blockingReason =
          "Plusieurs inscriptions joueur sont simultanément actives. Régularisation Ligue nécessaire.";
      } else if (!currentRegistration) {
        transferable = false;
        blockingReason =
          "Aucune inscription joueur actuellement active n'a été trouvée.";
      } else if (alreadyInTargetClub) {
        transferable = false;
        blockingReason = "Ce joueur appartient déjà au club d'accueil.";
      }

      return {
        personId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        birthDate: person.birthDate,
        federationId: person.federationId,
        sourceRegistrationId: currentRegistration?.id ?? null,
        currentClub: currentRegistration
          ? {
              organizationId: currentRegistration.organization.id,
              name: currentRegistration.organization.name,
              code: currentRegistration.organization.code,
              shortName:
                currentRegistration.organization.club?.shortName ?? null,
            }
          : null,
        currentLicense: currentLicense
          ? {
              id: currentLicense.id,
              number: currentLicense.number,
              status: currentLicense.status,
            }
          : null,
        transferable,
        blockingReason,
        dataQuality: {
          multipleActiveRegistrations: currentRegistrations.length > 1,
        },
      };
    });
  }

  async list(actor: AuthenticatedActor) {
    const where = this.transferReadScope(actor);

    return this.prisma.playerTransfer.findMany({
      where,
      include: this.transferReadInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async get(actor: AuthenticatedActor, transferId: string) {
    const transfer = await this.prisma.playerTransfer.findFirst({
      where: {
        id: transferId,
        ...this.transferReadScope(actor),
      },
      include: this.transferReadInclude,
    });

    if (!transfer) {
      throw new NotFoundException("Transfert introuvable");
    }

    return transfer;
  }

  async startLeagueReview(actor: AuthenticatedActor, transferId: string) {
    const isLeagueAdmin = actor.memberships.some(
      (membership) => membership.role === Role.LIGUE_ADMIN,
    );

    if (!isLeagueAdmin) {
      throw new ForbiddenException(
        "Seule la Ligue peut prendre en charge un transfert",
      );
    }

    const transfer = await this.prisma.playerTransfer.findUnique({
      where: { id: transferId },
    });

    if (!transfer) {
      throw new NotFoundException("Transfert introuvable");
    }

    this.transferStatus.assertTransition(
      transfer.status,
      PlayerTransferStatus.LEAGUE_REVIEW,
    );

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const leagueReviewedAt = new Date();

      const transition = await tx.playerTransfer.updateMany({
        where: {
          id: transfer.id,
          status: transfer.status,
        },
        data: {
          status: PlayerTransferStatus.LEAGUE_REVIEW,
          leagueReviewedAt,
          leagueReviewedByUserId: actor.userId,
        },
      });

      if (transition.count !== 1) {
        throw new ConflictException(
          "Le transfert a été modifié par une autre opération",
        );
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "PLAYER_TRANSFER_LEAGUE_REVIEW_STARTED",
          resourceType: "PlayerTransfer",
          resourceId: transfer.id,
          metadata: {
            personId: transfer.personId,
            sourceOrganizationId: transfer.sourceOrganizationId,
            targetOrganizationId: transfer.targetOrganizationId,
            fromStatus: transfer.status,
            toStatus: PlayerTransferStatus.LEAGUE_REVIEW,
          },
        },
      });

      return {
        ...transfer,
        status: PlayerTransferStatus.LEAGUE_REVIEW,
        leagueReviewedAt,
        leagueReviewedByUserId: actor.userId,
      };
    });
  }

  async makeEffective(actor: AuthenticatedActor, transferId: string) {
    const isLeagueAdmin = actor.memberships.some(
      (membership) => membership.role === Role.LIGUE_ADMIN,
    );

    if (!isLeagueAdmin) {
      throw new ForbiddenException(
        "Seule la Ligue peut rendre un transfert effectif",
      );
    }

    const transfer = await this.prisma.playerTransfer.findUnique({
      where: { id: transferId },
      include: {
        season: true,
        sourceRegistration: {
          include: {
            playerProfile: true,
            licenses: true,
          },
        },
      },
    });

    if (!transfer) {
      throw new NotFoundException("Transfert introuvable");
    }

    this.transferStatus.assertTransition(
      transfer.status,
      PlayerTransferStatus.EFFECTIVE,
    );

    const sourceRegistration = transfer.sourceRegistration;

    if (sourceRegistration.personId !== transfer.personId) {
      throw new ConflictException(
        "L'inscription source ne correspond plus au joueur du transfert",
      );
    }

    if (sourceRegistration.organizationId !== transfer.sourceOrganizationId) {
      throw new ConflictException(
        "L'inscription source ne correspond plus au club quitté",
      );
    }

    if (sourceRegistration.category !== RegistrationCategory.PLAYER) {
      throw new BadRequestException(
        "L'inscription source n'est pas une inscription joueur",
      );
    }

    if (
      sourceRegistration.status !== RegistrationStatus.DRAFT &&
      sourceRegistration.status !== RegistrationStatus.VALIDATED &&
      sourceRegistration.status !== RegistrationStatus.SUSPENDED
    ) {
      throw new ConflictException(
        `L'inscription source ${sourceRegistration.status} ne peut pas être clôturée pour ce transfert`,
      );
    }

    if (!sourceRegistration.playerProfile) {
      throw new ConflictException(
        "Le profil joueur de l'inscription source est introuvable",
      );
    }

    const sourcePlayerProfile = sourceRegistration.playerProfile;

    if (transfer.targetRegistrationId) {
      throw new ConflictException(
        "Le transfert possède déjà une inscription dans le club d'accueil",
      );
    }

    if (transfer.requestedStartDate <= sourceRegistration.startDate) {
      throw new BadRequestException(
        "La date de prise d'effet doit être postérieure à la date de début de l'inscription source",
      );
    }

    const existingTargetRegistration = await this.prisma.registration.findFirst(
      {
        where: {
          personId: transfer.personId,
          organizationId: transfer.targetOrganizationId,
          category: RegistrationCategory.PLAYER,
          status: {
            not: RegistrationStatus.ARCHIVED,
          },
        },
        select: { id: true },
      },
    );

    if (existingTargetRegistration) {
      throw new ConflictException(
        "Ce joueur possède déjà une inscription active ou en cours dans le club d'accueil",
      );
    }

    const sourceSeasonLicenses = sourceRegistration.licenses.filter(
      (license) => license.season === transfer.season.name,
    );

    const blockingLicense = sourceSeasonLicenses.find(
      (license) =>
        license.status !== LicenseStatus.CANCELLED &&
        license.status !== LicenseStatus.EXPIRED &&
        license.status !== LicenseStatus.ISSUED_BY_FBF &&
        license.status !== LicenseStatus.SUSPENDED,
    );

    if (blockingLicense) {
      throw new ConflictException(
        `La licence source ${blockingLicense.status} doit être régularisée avant de rendre le transfert effectif`,
      );
    }

    const sourceEndDate = new Date(transfer.requestedStartDate);
    sourceEndDate.setUTCDate(sourceEndDate.getUTCDate() - 1);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const claimed = await tx.playerTransfer.updateMany({
        where: {
          id: transfer.id,
          status: PlayerTransferStatus.APPROVED,
          targetRegistrationId: null,
        },
        data: {
          status: PlayerTransferStatus.EFFECTIVE,
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException(
          "Le transfert a été modifié par une autre opération",
        );
      }

      const sourceClosed = await tx.registration.updateMany({
        where: {
          id: sourceRegistration.id,
          personId: transfer.personId,
          organizationId: transfer.sourceOrganizationId,
          status: sourceRegistration.status,
        },
        data: {
          status: RegistrationStatus.ARCHIVED,
          endDate: sourceEndDate,
        },
      });

      if (sourceClosed.count !== 1) {
        throw new ConflictException(
          "L'inscription source a été modifiée par une autre opération",
        );
      }

      const concurrentTargetRegistration = await tx.registration.findFirst({
        where: {
          personId: transfer.personId,
          organizationId: transfer.targetOrganizationId,
          category: RegistrationCategory.PLAYER,
          status: {
            not: RegistrationStatus.ARCHIVED,
          },
        },
        select: { id: true },
      });

      if (concurrentTargetRegistration) {
        throw new ConflictException(
          "Ce joueur possède déjà une inscription active ou en cours dans le club d'accueil",
        );
      }

      const cancellableLicenses = sourceSeasonLicenses.filter(
        (license) =>
          license.status === LicenseStatus.ISSUED_BY_FBF ||
          license.status === LicenseStatus.SUSPENDED,
      );

      for (const license of cancellableLicenses) {
        const cancelled = await tx.license.updateMany({
          where: {
            id: license.id,
            status: license.status,
          },
          data: {
            status: LicenseStatus.CANCELLED,
          },
        });

        if (cancelled.count !== 1) {
          throw new ConflictException(
            "La licence source a été modifiée par une autre opération",
          );
        }

        await tx.auditLog.create({
          data: {
            actorUserId: actor.userId,
            organizationId: transfer.sourceOrganizationId,
            action: "LICENSE_CANCELLED",
            resourceType: "License",
            resourceId: license.id,
            metadata: {
              reason: "Transfert joueur devenu effectif",
              transferId: transfer.id,
            },
          },
        });
      }

      const targetRegistration = await tx.registration.create({
        data: {
          personId: transfer.personId,
          organizationId: transfer.targetOrganizationId,
          category: RegistrationCategory.PLAYER,
          status: RegistrationStatus.DRAFT,
          startDate: transfer.requestedStartDate,
          playerProfile: {
            create: {
              position: sourcePlayerProfile.position,
              shirtName: sourcePlayerProfile.shirtName?.trim() || null,
            },
          },
        },
        include: {
          person: true,
          playerProfile: true,
          licenses: true,
          documents: true,
        },
      });

      const targetLicense = await tx.license.create({
        data: {
          registrationId: targetRegistration.id,
          season: transfer.season.name,
          status: LicenseStatus.DRAFT,
        },
      });

      const effectiveAt = new Date();

      const linked = await tx.playerTransfer.updateMany({
        where: {
          id: transfer.id,
          status: PlayerTransferStatus.EFFECTIVE,
          targetRegistrationId: null,
        },
        data: {
          targetRegistrationId: targetRegistration.id,
          effectiveAt,
        },
      });

      if (linked.count !== 1) {
        throw new ConflictException(
          "Le transfert n'a pas pu être rattaché à la nouvelle inscription",
        );
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: transfer.sourceOrganizationId,
          action: "PLAYER_TRANSFER_SOURCE_REGISTRATION_ARCHIVED",
          resourceType: "Registration",
          resourceId: sourceRegistration.id,
          metadata: {
            transferId: transfer.id,
            personId: transfer.personId,
            endDate: sourceEndDate.toISOString(),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: transfer.targetOrganizationId,
          action: "PLAYER_TRANSFER_TARGET_REGISTRATION_CREATED",
          resourceType: "Registration",
          resourceId: targetRegistration.id,
          metadata: {
            transferId: transfer.id,
            personId: transfer.personId,
            sourceRegistrationId: sourceRegistration.id,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: transfer.targetOrganizationId,
          action: "LICENSE_CREATED",
          resourceType: "License",
          resourceId: targetLicense.id,
          metadata: {
            transferId: transfer.id,
            registrationId: targetRegistration.id,
            season: transfer.season.name,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "PLAYER_TRANSFER_EFFECTIVE",
          resourceType: "PlayerTransfer",
          resourceId: transfer.id,
          metadata: {
            personId: transfer.personId,
            sourceRegistrationId: sourceRegistration.id,
            targetRegistrationId: targetRegistration.id,
            sourceOrganizationId: transfer.sourceOrganizationId,
            targetOrganizationId: transfer.targetOrganizationId,
            requestedStartDate: transfer.requestedStartDate.toISOString(),
          },
        },
      });

      return {
        ...transfer,
        status: PlayerTransferStatus.EFFECTIVE,
        targetRegistrationId: targetRegistration.id,
        targetRegistration,
        targetLicense,
        effectiveAt,
      };
    });
  }

  async leagueDecision(
    actor: AuthenticatedActor,
    transferId: string,
    input: LeagueTransferDecisionDto,
  ) {
    const isLeagueAdmin = actor.memberships.some(
      (membership) => membership.role === Role.LIGUE_ADMIN,
    );

    if (!isLeagueAdmin) {
      throw new ForbiddenException(
        "Seule la Ligue peut décider d'un transfert",
      );
    }

    const transfer = await this.prisma.playerTransfer.findUnique({
      where: { id: transferId },
    });

    if (!transfer) {
      throw new NotFoundException("Transfert introuvable");
    }

    this.transferStatus.assertTransition(transfer.status, input.decision);

    const reason = input.reason?.trim() || null;

    if (input.decision === PlayerTransferStatus.REJECTED && !reason) {
      throw new BadRequestException(
        "Le motif de rejet du transfert est obligatoire",
      );
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const leagueDecidedAt = new Date();

      const transition = await tx.playerTransfer.updateMany({
        where: {
          id: transfer.id,
          status: transfer.status,
        },
        data: {
          status: input.decision,
          leagueReason: reason,
          leagueDecidedAt,
          leagueDecidedByUserId: actor.userId,
        },
      });

      if (transition.count !== 1) {
        throw new ConflictException(
          "Le transfert a été modifié par une autre opération",
        );
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "PLAYER_TRANSFER_LEAGUE_DECISION",
          resourceType: "PlayerTransfer",
          resourceId: transfer.id,
          metadata: {
            personId: transfer.personId,
            sourceOrganizationId: transfer.sourceOrganizationId,
            targetOrganizationId: transfer.targetOrganizationId,
            fromStatus: transfer.status,
            toStatus: input.decision,
            reason,
          },
        },
      });

      return {
        ...transfer,
        status: input.decision,
        leagueReason: reason,
        leagueDecidedAt,
        leagueDecidedByUserId: actor.userId,
      };
    });
  }

  async formerClubDecision(
    actor: AuthenticatedActor,
    transferId: string,
    input: FormerClubTransferDecisionDto,
  ) {
    const transfer = await this.prisma.playerTransfer.findUnique({
      where: { id: transferId },
    });

    if (!transfer) {
      throw new NotFoundException("Transfert introuvable");
    }

    this.tenantAccess.assertOrganizationAccess(
      actor,
      transfer.sourceOrganizationId,
    );

    this.transferStatus.assertTransition(transfer.status, input.decision);

    const reason = input.reason?.trim() || null;

    if (input.decision === PlayerTransferStatus.OPPOSED && !reason) {
      throw new BadRequestException(
        "Le motif d'opposition du club quitté est obligatoire",
      );
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const formerClubDecidedAt = new Date();

      const transition = await tx.playerTransfer.updateMany({
        where: {
          id: transfer.id,
          status: transfer.status,
        },
        data: {
          status: input.decision,
          formerClubReason: reason,
          formerClubDecidedAt,
          formerClubDecidedByUserId: actor.userId,
        },
      });

      if (transition.count !== 1) {
        throw new ConflictException(
          "Le transfert a été modifié par une autre opération",
        );
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: transfer.sourceOrganizationId,
          action: "PLAYER_TRANSFER_FORMER_CLUB_DECISION",
          resourceType: "PlayerTransfer",
          resourceId: transfer.id,
          metadata: {
            personId: transfer.personId,
            sourceOrganizationId: transfer.sourceOrganizationId,
            targetOrganizationId: transfer.targetOrganizationId,
            fromStatus: transfer.status,
            toStatus: input.decision,
            reason,
          },
        },
      });

      return {
        ...transfer,
        status: input.decision,
        formerClubReason: reason,
        formerClubDecidedAt,
        formerClubDecidedByUserId: actor.userId,
      };
    });
  }

  async submit(actor: AuthenticatedActor, transferId: string) {
    const transfer = await this.prisma.playerTransfer.findUnique({
      where: { id: transferId },
    });

    if (!transfer) {
      throw new NotFoundException("Transfert introuvable");
    }

    this.tenantAccess.assertOrganizationAccess(
      actor,
      transfer.targetOrganizationId,
    );

    this.transferStatus.assertTransition(
      transfer.status,
      PlayerTransferStatus.REQUESTED,
    );

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const requestedAt = new Date();

      const transition = await tx.playerTransfer.updateMany({
        where: {
          id: transfer.id,
          status: transfer.status,
        },
        data: {
          status: PlayerTransferStatus.REQUESTED,
          requestedAt,
        },
      });

      if (transition.count !== 1) {
        throw new ConflictException(
          "Le transfert a été modifié par une autre opération",
        );
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: transfer.targetOrganizationId,
          action: "PLAYER_TRANSFER_SUBMITTED",
          resourceType: "PlayerTransfer",
          resourceId: transfer.id,
          metadata: {
            personId: transfer.personId,
            sourceOrganizationId: transfer.sourceOrganizationId,
            targetOrganizationId: transfer.targetOrganizationId,
            fromStatus: transfer.status,
            toStatus: PlayerTransferStatus.REQUESTED,
          },
        },
      });

      return {
        ...transfer,
        status: PlayerTransferStatus.REQUESTED,
        requestedAt,
      };
    });
  }

  async create(actor: AuthenticatedActor, input: CreatePlayerTransferDto) {
    const sourceRegistration = await this.prisma.registration.findUnique({
      where: { id: input.sourceRegistrationId },
      include: {
        person: true,
        organization: {
          include: { club: true },
        },
        playerProfile: true,
      },
    });

    if (!sourceRegistration) {
      throw new NotFoundException("Inscription source introuvable");
    }

    if (sourceRegistration.category !== RegistrationCategory.PLAYER) {
      throw new BadRequestException(
        "L'inscription source n'est pas une inscription joueur",
      );
    }

    if (sourceRegistration.personId !== input.personId) {
      throw new BadRequestException(
        "L'inscription source ne correspond pas au joueur sélectionné",
      );
    }

    if (sourceRegistration.status === RegistrationStatus.ARCHIVED) {
      throw new BadRequestException(
        "Une inscription archivée ne peut pas initier un transfert",
      );
    }

    if (!sourceRegistration.playerProfile) {
      throw new BadRequestException(
        "Le profil joueur de l'inscription source est introuvable",
      );
    }

    this.tenantAccess.assertOrganizationAccess(
      actor,
      input.targetOrganizationId,
    );

    const isLeagueAdmin = actor.memberships.some(
      (membership) => membership.role === Role.LIGUE_ADMIN,
    );

    if (!isLeagueAdmin) {
      const clubOrganizationIds = actor.memberships
        .filter((membership) => membership.role === Role.CLUB_ADMIN)
        .map((membership) => membership.organizationId);

      if (!clubOrganizationIds.includes(input.targetOrganizationId)) {
        throw new ForbiddenException(
          "Un club ne peut créer une demande de transfert que pour lui-même",
        );
      }
    }

    if (sourceRegistration.organizationId === input.targetOrganizationId) {
      throw new BadRequestException(
        "Le club d'accueil doit être différent du club quitté",
      );
    }

    const targetOrganization = await this.prisma.organization.findUnique({
      where: { id: input.targetOrganizationId },
      include: { club: true },
    });

    if (
      !targetOrganization ||
      targetOrganization.type !== OrganizationType.CLUB ||
      !targetOrganization.club
    ) {
      throw new NotFoundException("Club d'accueil introuvable");
    }

    if (!targetOrganization.active) {
      throw new BadRequestException("Le club d'accueil est inactif");
    }

    const existingTargetRegistration = await this.prisma.registration.findFirst(
      {
        where: {
          personId: input.personId,
          organizationId: input.targetOrganizationId,
          category: RegistrationCategory.PLAYER,
          status: {
            not: RegistrationStatus.ARCHIVED,
          },
        },
        select: { id: true },
      },
    );

    if (existingTargetRegistration) {
      throw new ConflictException(
        "Ce joueur possède déjà une inscription active ou en cours dans le club d'accueil",
      );
    }

    const existingTransfer = await this.prisma.playerTransfer.findFirst({
      where: {
        personId: input.personId,
        status: {
          in: OPEN_TRANSFER_STATUSES,
        },
      },
      select: { id: true },
    });

    if (existingTransfer) {
      throw new ConflictException(
        "Un transfert est déjà en cours pour ce joueur",
      );
    }

    const requestedStartDate = new Date(
      `${input.requestedStartDate}T00:00:00.000Z`,
    );

    if (Number.isNaN(requestedStartDate.getTime())) {
      throw new BadRequestException("La date de prise d'effet est invalide");
    }

    const season = await this.prisma.season.findUnique({
      where: { id: input.seasonId },
    });

    if (!season) {
      throw new NotFoundException("Saison introuvable");
    }

    if (
      requestedStartDate < season.startDate ||
      requestedStartDate > season.endDate
    ) {
      throw new BadRequestException(
        "La date de prise d'effet du transfert doit appartenir à la saison sélectionnée",
      );
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const transfer = await tx.playerTransfer.create({
        data: {
          personId: sourceRegistration.personId,
          sourceRegistrationId: sourceRegistration.id,
          sourceOrganizationId: sourceRegistration.organizationId,
          targetOrganizationId: targetOrganization.id,
          requestedStartDate,
          seasonId: season.id,
          reason: input.reason?.trim() || null,
          createdByUserId: actor.userId,
          status: PlayerTransferStatus.DRAFT,
        },
        include: {
          person: true,
          sourceOrganization: {
            include: { club: true },
          },
          targetOrganization: {
            include: { club: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: targetOrganization.id,
          action: "PLAYER_TRANSFER_CREATED",
          resourceType: "PlayerTransfer",
          resourceId: transfer.id,
          metadata: {
            personId: sourceRegistration.personId,
            sourceRegistrationId: sourceRegistration.id,
            sourceOrganizationId: sourceRegistration.organizationId,
            targetOrganizationId: targetOrganization.id,
            status: PlayerTransferStatus.DRAFT,
          },
        },
      });

      return transfer;
    });
  }
}
