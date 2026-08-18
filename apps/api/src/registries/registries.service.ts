import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, OrganizationType, Prisma, RegistrationCategory } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import { TenantAccessService } from '../iam/tenant-access.service';
import { AddDocumentDto } from './dto/add-document.dto';
import { CreateOfficialDto } from './dto/create-official.dto';
import { CreatePlayerDto } from './dto/create-player.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { DocumentDecisionDto } from './dto/document-decision.dto';

@Injectable()
export class RegistriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async listPlayers(actor: AuthenticatedActor, organizationId: string) {
    return this.listByCategory(actor, organizationId, RegistrationCategory.PLAYER);
  }

  async listStaff(actor: AuthenticatedActor, organizationId: string) {
    return this.listByCategory(actor, organizationId, RegistrationCategory.STAFF);
  }

  async listOfficials(actor: AuthenticatedActor, organizationId: string) {
    return this.listByCategory(actor, organizationId, RegistrationCategory.OFFICIAL);
  }

  async createPlayer(actor: AuthenticatedActor, input: CreatePlayerDto) {
    await this.assertOrganizationType(input.organizationId, OrganizationType.CLUB);
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
            category: RegistrationCategory.PLAYER,
            startDate: new Date(input.startDate),
            endDate: input.endDate ? new Date(input.endDate) : undefined,
            playerProfile: {
              create: {
                position: input.position,
                shirtName: input.shirtName?.trim(),
                shirtNumber: input.shirtNumber,
              },
            },
          },
        },
      },
      include: { registrations: { include: { playerProfile: true } } },
    });
  }

  async createStaff(actor: AuthenticatedActor, input: CreateStaffDto) {
    await this.assertOrganizationType(input.organizationId, OrganizationType.CLUB);
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

  async createOfficial(actor: AuthenticatedActor, input: CreateOfficialDto) {
    await this.assertOrganizationType(input.organizationId, OrganizationType.LEAGUE);
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
    if (!registration) throw new NotFoundException('Inscription introuvable');
    this.tenantAccess.assertOrganizationAccess(actor, registration.organizationId);

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
          action: 'REGISTRATION_DOCUMENT_ADDED',
          resourceType: 'RegistrationDocument',
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
    if (!document) throw new NotFoundException('Document introuvable');
    if (document.status !== DocumentStatus.PENDING) {
      throw new BadRequestException('Seul un document en attente peut être traité');
    }
    if (input.decision === 'REJECTED' && !input.reason?.trim()) {
      throw new BadRequestException('Le motif de rejet est obligatoire');
    }

    const status =
      input.decision === 'APPROVED'
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
              ? 'REGISTRATION_DOCUMENT_APPROVED'
              : 'REGISTRATION_DOCUMENT_REJECTED',
          resourceType: 'RegistrationDocument',
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
        person: true,
        playerProfile: true,
        staffProfile: true,
        officialProfile: true,
        licenses: { orderBy: { createdAt: 'desc' } },
        documents: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { person: { lastName: 'asc' } },
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
    if (!organization) throw new NotFoundException('Organisation introuvable');
    if (organization.type !== expected) {
      throw new BadRequestException(
        expected === OrganizationType.CLUB
          ? 'Cette inscription doit être rattachée à un club'
          : 'Cet officiel doit être rattaché à la Ligue',
      );
    }
  }
}
