import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RegistrationCategory, RegistrationStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import { TenantAccessService } from '../iam/tenant-access.service';

@Injectable()
export class StaffLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async archiveStaff(actor: AuthenticatedActor, registrationId: string) {
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        organizationId: true,
        category: true,
        status: true,
      },
    });

    if (!registration || registration.category !== RegistrationCategory.STAFF) {
      throw new NotFoundException('Membre du staff introuvable');
    }

    this.tenantAccess.assertOrganizationAccess(actor, registration.organizationId);

    if (registration.status === RegistrationStatus.ARCHIVED) {
      throw new BadRequestException('Ce membre du staff est déjà archivé');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.registration.update({
        where: { id: registrationId },
        data: {
          status: RegistrationStatus.ARCHIVED,
          endDate: new Date(),
        },
        include: {
          person: true,
          staffProfile: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: registration.organizationId,
          action: 'STAFF_ARCHIVED',
          resourceType: 'Registration',
          resourceId: registrationId,
          metadata: {
            previousStatus: registration.status,
            status: RegistrationStatus.ARCHIVED,
          },
        },
      });

      return updated;
    });
  }
}
