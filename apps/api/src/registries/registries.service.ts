import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DocumentStatus,
  LicenseStatus,
  OrganizationType,
  Prisma,
  RegistrationCategory,
  RegistrationStatus,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { DisciplineService } from "../discipline/discipline.service";
import { AuthenticatedActor } from "../iam/domain/actor";
import { TenantAccessService } from "../iam/tenant-access.service";
import { AddDocumentDto } from "./dto/add-document.dto";
import { CreateOfficialDto } from "./dto/create-official.dto";
import { CreatePlayerDto } from "./dto/create-player.dto";
import { CreateStaffDto } from "./dto/create-staff.dto";
import { DocumentDecisionDto } from "./dto/document-decision.dto";
import { UpdatePlayerPhotoDto } from "./dto/update-player-photo.dto";
import { UpdateStaffDto } from "./dto/update-staff.dto";
import {
  buildPlayerDeduplicationKey,
  buildPlayerIdentityKey,
  parseStrictDate,
} from "./player-registration.rules";

@Injectable()
export class RegistriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
    private readonly discipline?: DisciplineService,
  ) {}

  async listPlayers(actor: AuthenticatedActor, organizationId: string) {
    return this.listByCategory(
      actor,
      organizationId,
      RegistrationCategory.PLAYER,
    );
  }

  async listStaff(actor: AuthenticatedActor, organizationId: string) {
    return this.listByCategory(
      actor,
      organizationId,
      RegistrationCategory.STAFF,
    );
  }

  async listOfficials(actor: AuthenticatedActor, organizationId: string) {
    return this.listByCategory(
      actor,
      organizationId,
      RegistrationCategory.OFFICIAL,
    );
  }

  async createPlayer(actor: AuthenticatedActor, input: CreatePlayerDto) {
    await this.assertOrganizationType(
      input.organizationId,
      OrganizationType.CLUB,
    );
    this.tenantAccess.assertOrganizationAccess(actor, input.organizationId);

    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const birthDate = parseStrictDate(input.birthDate, "La date de naissance", {
      forbidFuture: true,
    });
    const startDate = parseStrictDate(input.startDate, "La date d’arrivée");
    const endDate = input.endDate
      ? parseStrictDate(input.endDate, "La date de fin")
      : undefined;

    if (endDate && endDate < startDate) {
      throw new BadRequestException(
        "La date de fin ne peut pas précéder la date d’arrivée",
      );
    }

    const identityKey = buildPlayerIdentityKey({
      firstName,
      lastName,
      birthDate: input.birthDate,
    });

    const deduplicationKey = buildPlayerDeduplicationKey({
      organizationId: input.organizationId,
      firstName,
      lastName,
      birthDate: input.birthDate,
    });

    const existingRegistration = await this.prisma.registration.findFirst({
      where: {
        organizationId: input.organizationId,
        category: RegistrationCategory.PLAYER,
        person: {
          firstName: { equals: firstName, mode: "insensitive" },
          lastName: { equals: lastName, mode: "insensitive" },
          birthDate,
        },
      },
      select: { id: true },
    });

    if (existingRegistration) {
      throw new ConflictException(
        "Ce joueur existe déjà dans l’effectif de ce club",
      );
    }

    const homonymCandidates = await this.prisma.person.findMany({
      where: {
        firstName: { equals: firstName, mode: "insensitive" },
        lastName: { equals: lastName, mode: "insensitive" },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        federationId: true,
      },
      take: 5,
    });

    const identityCandidates = await this.prisma.person.findMany({
      where: {
        OR: [
          { identityKey },
          {
            identityKey: null,
            firstName: { equals: firstName, mode: "insensitive" },
            lastName: { equals: lastName, mode: "insensitive" },
            birthDate,
          },
        ],
      },
      select: {
        id: true,
        identityKey: true,
        federationId: true,
      },
      take: 2,
    });

    if (identityCandidates.length > 0) {
      throw new ConflictException(
        "Un joueur avec les mêmes nom, prénom et date de naissance existe déjà. Digital Foot ne peut pas confirmer automatiquement qu’il s’agit de la même personne. Un contrôle Ligue est nécessaire avant toute nouvelle inscription.",
      );
    }

    try {
      return await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const person = await tx.person.create({
            data: {
              firstName,
              lastName,
              birthDate,
              nationality: input.nationality?.trim(),
              identityKey,
            },
            select: { id: true },
          });

          const personId = person.id;

          const registration = await tx.registration.create({
            data: {
              personId,
              organizationId: input.organizationId,
              category: RegistrationCategory.PLAYER,
              deduplicationKey,
              startDate,
              endDate,
              playerProfile: {
                create: {
                  position: input.position,
                  shirtName: input.shirtName?.trim(),
                  shirtNumber: input.shirtNumber,
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

          await tx.auditLog.create({
            data: {
              actorUserId: actor.userId,
              organizationId: input.organizationId,
              action: "PLAYER_CREATED",
              resourceType: "Registration",
              resourceId: registration.id,
              metadata: {
                personId,
                reusedPerson: false,
              },
            },
          });

          return registration;
        },
      );
    } catch (reason) {
      if (
        reason instanceof Prisma.PrismaClientKnownRequestError &&
        reason.code === "P2002"
      ) {
        throw new ConflictException(
          "Ce joueur existe déjà dans l’effectif de ce club ou son identité est déjà en cours de traitement",
        );
      }
      throw reason;
    }
  }

  async listPlayer360(actor: AuthenticatedActor) {
    const scope = this.tenantAccess.organizationScope(actor);

    if (scope !== null) {
      throw new ForbiddenException(
        "La liste Player 360 complète est réservée à la Ligue",
      );
    }

    const people = await this.prisma.person.findMany({
      where: {
        registrations: {
          some: {
            category: RegistrationCategory.PLAYER,
          },
        },
      },
      include: {
        registrations: {
          where: {
            category: RegistrationCategory.PLAYER,
          },
          include: {
            organization: {
              include: {
                club: true,
              },
            },
            licenses: {
              orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
            },
          },
          orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
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

      return {
        personId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        birthDate: person.birthDate,
        nationality: person.nationality,
        federationId: person.federationId,

        current: currentRegistration
          ? {
              registrationId: currentRegistration.id,

              club: currentRegistration.organization.club
                ? {
                    id: currentRegistration.organization.club.id,
                    organizationId: currentRegistration.organization.id,
                    name: currentRegistration.organization.name,
                    code: currentRegistration.organization.code,
                    shortName: currentRegistration.organization.club.shortName,
                    division: currentRegistration.organization.club.division,
                    city: currentRegistration.organization.club.city,
                  }
                : null,

              registrationStatus: currentRegistration.status,
              license: currentLicense,
            }
          : null,

        registrations: person.registrations.length,

        clubs: new Set(
          person.registrations.map(
            (registration) => registration.organizationId,
          ),
        ).size,

        dataQuality: {
          multipleActiveRegistrations: currentRegistrations.length > 1,
        },
      };
    });
  }

  async getPlayer360(actor: AuthenticatedActor, personId: string) {
    const scope = this.tenantAccess.organizationScope(actor);

    if (scope !== null) {
      throw new ForbiddenException(
        "La fiche Player 360 complète est réservée à la Ligue",
      );
    }

    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      include: {
        registrations: {
          where: {
            category: RegistrationCategory.PLAYER,
          },
          include: {
            organization: {
              include: {
                club: true,
              },
            },
            playerProfile: true,
            licenses: {
              orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
            },
            documents: {
              orderBy: { createdAt: "desc" },
            },
          },
          orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        },
      },
    });

    if (!person || person.registrations.length === 0) {
      throw new NotFoundException("Joueur introuvable");
    }

    const now = new Date();

    const currentRegistrations = person.registrations.filter(
      (registration) =>
        registration.status !== RegistrationStatus.ARCHIVED &&
        registration.startDate <= now &&
        (!registration.endDate || registration.endDate >= now),
    );

    if (currentRegistrations.length > 1) {
      throw new ConflictException(
        "Plusieurs inscriptions joueur sont simultanément actives. Une régularisation Ligue est nécessaire.",
      );
    }

    const currentRegistration = currentRegistrations[0] ?? null;

    const currentLicense =
      currentRegistration?.licenses.find(
        (license) =>
          license.status !== LicenseStatus.CANCELLED &&
          license.status !== LicenseStatus.EXPIRED &&
          (!license.validFrom || license.validFrom <= now) &&
          (!license.validUntil || license.validUntil >= now),
      ) ?? null;

    const { photoData, photoMimeType, registrations, ...identity } = person;

    const registrationIds = registrations.map(
      (registration) => registration.id,
    );

    const competitions =
      registrationIds.length === 0
        ? []
        : await this.prisma.competition.findMany({
            where: {
              matches: {
                some: {
                  homologationStatus: "HOMOLOGATED",
                  matchSheet: {
                    players: {
                      some: {
                        registrationId: {
                          in: registrationIds,
                        },
                      },
                    },
                  },
                },
              },
            },
            select: {
              id: true,
              name: true,
              code: true,
              division: true,
              season: {
                select: {
                  id: true,
                  name: true,
                  startDate: true,
                  endDate: true,
                },
              },
              matches: {
                where: {
                  homologationStatus: "HOMOLOGATED",
                  matchSheet: {
                    players: {
                      some: {
                        registrationId: {
                          in: registrationIds,
                        },
                      },
                    },
                  },
                },
                select: {
                  id: true,
                },
              },
            },
            orderBy: {
              season: {
                startDate: "desc",
              },
            },
          });

    const competitionSummaries = await Promise.all(
      competitions.map(async (competition) => {
        const matchIds = competition.matches.map((match) => match.id);

        const eventLogs =
          matchIds.length === 0
            ? []
            : await this.prisma.auditLog.findMany({
                where: {
                  resourceType: "MatchEvent",
                  resourceId: {
                    in: matchIds,
                  },
                  action: {
                    in: [
                      "MATCH_EVENT_GOAL",
                      "MATCH_EVENT_YELLOW_CARD",
                      "MATCH_EVENT_RED_CARD",
                    ],
                  },
                },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              });

        let goals = 0;
        let yellowCards = 0;
        let redCards = 0;

        for (const log of eventLogs) {
          if (
            !log.metadata ||
            typeof log.metadata !== "object" ||
            Array.isArray(log.metadata)
          ) {
            continue;
          }

          const metadata = log.metadata as Record<string, unknown>;

          if (
            typeof metadata.registrationId !== "string" ||
            !registrationIds.includes(metadata.registrationId)
          ) {
            continue;
          }

          if (log.action === "MATCH_EVENT_GOAL") {
            goals += 1;
          }

          if (log.action === "MATCH_EVENT_YELLOW_CARD") {
            yellowCards += 1;
          }

          if (log.action === "MATCH_EVENT_RED_CARD") {
            redCards += 1;
          }
        }

        const disciplineStates = this.discipline
          ? await Promise.all(
              registrationIds.map((registrationId) =>
                this.discipline!.getPlayerDisciplineState(
                  competition.id,
                  registrationId,
                ),
              ),
            )
          : [];

        const activeSuspensions = disciplineStates
          .filter((state) => state.activeSuspension)
          .map((state) => ({
            registrationId: state.registrationId,
            ...state.activeSuspension!,
          }));

        return {
          id: competition.id,
          name: competition.name,
          code: competition.code,
          division: competition.division,
          season: competition.season,
          homologatedMatchesCount: matchIds.length,
          statistics: {
            goals,
            yellowCards,
            redCards,
          },
          discipline: {
            activeSuspensions,
          },
        };
      }),
    );

    const career = registrations.map((registration) => ({
      registrationId: registration.id,
      organizationId: registration.organizationId,
      club: registration.organization.club
        ? {
            id: registration.organization.club.id,
            organizationId: registration.organization.id,
            name: registration.organization.name,
            code: registration.organization.code,
            shortName: registration.organization.club.shortName,
            division: registration.organization.club.division,
            city: registration.organization.club.city,
          }
        : null,
      status: registration.status,
      startDate: registration.startDate,
      endDate: registration.endDate,
      playerProfile: registration.playerProfile,
      licenses: registration.licenses,
      documents: registration.documents,
    }));

    return {
      person: {
        ...identity,
        photoDataUrl:
          photoData && photoMimeType
            ? `data:${photoMimeType};base64,${Buffer.from(photoData).toString("base64")}`
            : null,
      },

      current: currentRegistration
        ? {
            registrationId: currentRegistration.id,
            organizationId: currentRegistration.organizationId,
            club: currentRegistration.organization.club
              ? {
                  id: currentRegistration.organization.club.id,
                  organizationId: currentRegistration.organization.id,
                  name: currentRegistration.organization.name,
                  code: currentRegistration.organization.code,
                  shortName: currentRegistration.organization.club.shortName,
                  division: currentRegistration.organization.club.division,
                  city: currentRegistration.organization.club.city,
                }
              : null,
            status: currentRegistration.status,
            startDate: currentRegistration.startDate,
            endDate: currentRegistration.endDate,
            playerProfile: currentRegistration.playerProfile,
            license: currentLicense,
          }
        : null,

      career,

      competitions: competitionSummaries,

      summary: {
        registrations: career.length,
        clubs: new Set(
          career
            .map((item) => item.organizationId)
            .filter((organizationId) => Boolean(organizationId)),
        ).size,
        firstRegistrationDate:
          career.length > 0
            ? career
                .map((item) => item.startDate)
                .sort((a, b) => a.getTime() - b.getTime())[0]
            : null,
        currentRegistrationId: currentRegistration?.id ?? null,
      },
    };
  }

  async getPlayer(actor: AuthenticatedActor, registrationId: string) {
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        person: true,
        playerProfile: true,
        licenses: { orderBy: { createdAt: "desc" } },
        documents: { orderBy: { createdAt: "desc" } },
      },
    });

    if (
      !registration ||
      registration.category !== RegistrationCategory.PLAYER
    ) {
      throw new NotFoundException("Joueur introuvable");
    }
    this.tenantAccess.assertOrganizationAccess(
      actor,
      registration.organizationId,
    );

    const { photoData, photoMimeType, ...person } = registration.person;
    return {
      ...registration,
      person: {
        ...person,
        photoDataUrl:
          photoData && photoMimeType
            ? `data:${photoMimeType};base64,${Buffer.from(photoData).toString("base64")}`
            : null,
      },
    };
  }

  async updatePlayerPhoto(
    actor: AuthenticatedActor,
    registrationId: string,
    input: UpdatePlayerPhotoDto,
  ) {
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      select: {
        personId: true,
        organizationId: true,
        category: true,
      },
    });
    if (
      !registration ||
      registration.category !== RegistrationCategory.PLAYER
    ) {
      throw new NotFoundException("Joueur introuvable");
    }
    this.tenantAccess.assertOrganizationAccess(
      actor,
      registration.organizationId,
    );

    const match =
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        input.photoDataUrl,
      );
    if (!match) {
      throw new BadRequestException(
        "La photo doit être une image JPEG, PNG ou WebP valide",
      );
    }

    const [, mimeType, encoded] = match;
    const photoData = Buffer.from(encoded, "base64");
    if (photoData.length === 0 || photoData.length > 750_000) {
      throw new BadRequestException(
        "La photo doit avoir une taille maximale de 750 Ko",
      );
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.person.update({
        where: { id: registration.personId },
        data: { photoData, photoMimeType: mimeType },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: registration.organizationId,
          action: "PLAYER_PHOTO_UPDATED",
          resourceType: "Person",
          resourceId: registration.personId,
          metadata: {
            registrationId,
            mimeType,
            size: photoData.length,
          },
        },
      });
    });

    return this.getPlayer(actor, registrationId);
  }

  async createStaff(actor: AuthenticatedActor, input: CreateStaffDto) {
    await this.assertOrganizationType(
      input.organizationId,
      OrganizationType.CLUB,
    );
    this.tenantAccess.assertOrganizationAccess(actor, input.organizationId);

    return this.prisma.person.create({
      data: {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        birthDate: new Date(input.birthDate),
        nationality: input.nationality?.trim(),
        registrations: {
          create: {
            organizationId: input.organizationId,
            category: RegistrationCategory.STAFF,
            startDate: new Date(input.startDate),
            endDate: input.endDate ? new Date(input.endDate) : undefined,
            staffProfile: {
              create: {
                function: input.function,
                qualification: input.qualification?.trim(),
              },
            },
          },
        },
      },
      include: { registrations: { include: { staffProfile: true } } },
    });
  }

  async updateStaff(
    actor: AuthenticatedActor,
    registrationId: string,
    input: UpdateStaffDto,
  ) {
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      select: {
        personId: true,
        organizationId: true,
        category: true,
      },
    });

    if (!registration || registration.category !== RegistrationCategory.STAFF) {
      throw new NotFoundException("Membre du staff introuvable");
    }
    this.tenantAccess.assertOrganizationAccess(
      actor,
      registration.organizationId,
    );

    const birthDate = parseStrictDate(input.birthDate, "La date de naissance", {
      forbidFuture: true,
    });
    const startDate = parseStrictDate(input.startDate, "La date d’arrivée");
    const endDate = input.endDate
      ? parseStrictDate(input.endDate, "La date de fin")
      : null;

    if (endDate && endDate < startDate) {
      throw new BadRequestException(
        "La date de fin ne peut pas précéder la date d’arrivée",
      );
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.person.update({
        where: { id: registration.personId },
        data: {
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          birthDate,
          nationality: input.nationality?.trim() || null,
        },
      });

      await tx.registration.update({
        where: { id: registrationId },
        data: { startDate, endDate },
      });

      await tx.staffProfile.update({
        where: { registrationId },
        data: {
          function: input.function,
          qualification: input.qualification?.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: registration.organizationId,
          action: "STAFF_UPDATED",
          resourceType: "Registration",
          resourceId: registrationId,
          metadata: { function: input.function },
        },
      });

      return tx.registration.findUnique({
        where: { id: registrationId },
        include: { person: true, staffProfile: true },
      });
    });
  }

  async createOfficial(actor: AuthenticatedActor, input: CreateOfficialDto) {
    await this.assertOrganizationType(
      input.organizationId,
      OrganizationType.LEAGUE,
    );
    this.tenantAccess.assertOrganizationAccess(actor, input.organizationId);

    return this.prisma.person.create({
      data: {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        birthDate: new Date(input.birthDate),
        nationality: input.nationality?.trim(),
        registrations: {
          create: {
            organizationId: input.organizationId,
            category: RegistrationCategory.OFFICIAL,
            startDate: new Date(input.startDate),
            officialProfile: {
              create: {
                function: input.function,
                grade: input.grade?.trim(),
              },
            },
          },
        },
      },
      include: { registrations: { include: { officialProfile: true } } },
    });
  }

  async addDocument(
    actor: AuthenticatedActor,
    registrationId: string,
    input: AddDocumentDto,
  ) {
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
    });
    if (!registration) throw new NotFoundException("Inscription introuvable");
    this.tenantAccess.assertOrganizationAccess(
      actor,
      registration.organizationId,
    );

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const document = await tx.registrationDocument.create({
        data: {
          registrationId,
          type: input.type,
          storageKey: input.storageKey.trim(),
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: registration.organizationId,
          action: "REGISTRATION_DOCUMENT_ADDED",
          resourceType: "RegistrationDocument",
          resourceId: document.id,
          metadata: { type: input.type },
        },
      });
      return document;
    });
  }

  async decideDocument(
    actor: AuthenticatedActor,
    documentId: string,
    input: DocumentDecisionDto,
  ) {
    const document = await this.prisma.registrationDocument.findUnique({
      where: { id: documentId },
      include: { registration: { select: { organizationId: true } } },
    });
    if (!document) throw new NotFoundException("Document introuvable");
    if (document.status !== DocumentStatus.PENDING) {
      throw new BadRequestException(
        "Seul un document en attente peut être traité",
      );
    }
    if (input.decision === "REJECTED" && !input.reason?.trim()) {
      throw new BadRequestException("Le motif de rejet est obligatoire");
    }

    const status =
      input.decision === "APPROVED"
        ? DocumentStatus.VALID
        : DocumentStatus.REJECTED;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.registrationDocument.update({
        where: { id: documentId },
        data: { status },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: document.registration.organizationId,
          action:
            status === DocumentStatus.VALID
              ? "REGISTRATION_DOCUMENT_APPROVED"
              : "REGISTRATION_DOCUMENT_REJECTED",
          resourceType: "RegistrationDocument",
          resourceId: documentId,
          metadata: {
            previousStatus: document.status,
            status,
            reason: input.reason?.trim(),
          },
        },
      });
      return updated;
    });
  }

  private async listByCategory(
    actor: AuthenticatedActor,
    organizationId: string,
    category: RegistrationCategory,
  ) {
    this.tenantAccess.assertOrganizationAccess(actor, organizationId);
    return this.prisma.registration.findMany({
      where: { organizationId, category },
      include: {
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            nationality: true,
            federationId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        playerProfile: true,
        staffProfile: true,
        officialProfile: true,
        licenses: { orderBy: { createdAt: "desc" } },
        documents: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { person: { lastName: "asc" } },
    });
  }

  private async assertOrganizationType(
    organizationId: string,
    expected: OrganizationType,
  ): Promise<void> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { type: true },
    });
    if (!organization) throw new NotFoundException("Organisation introuvable");
    if (organization.type !== expected) {
      throw new BadRequestException(
        expected === OrganizationType.CLUB
          ? "Cette inscription doit être rattachée à un club"
          : "Cet officiel doit être rattaché à la Ligue",
      );
    }
  }
}
