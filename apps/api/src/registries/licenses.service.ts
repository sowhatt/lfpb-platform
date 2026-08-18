import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LicenseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import { TenantAccessService } from '../iam/tenant-access.service';
import { CreateLicenseDto } from './dto/create-license.dto';
import { LicenseDecisionDto } from './dto/license-decision.dto';
import { LicenseStatusService } from './license-status.service';

@Injectable()
export class LicensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
    private readonly statusWorkflow: LicenseStatusService,
  ) {}

  async listFor(actor: AuthenticatedActor, organizationId: string) {
    this.tenantAccess.assertOrganizationAccess(actor, organizationId);
    return this.prisma.license.findMany({
      where: { registration: { organizationId } },
      include: {
        registration: { include: { person: true, playerProfile: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(actor: AuthenticatedActor, input: CreateLicenseDto) {
    const registration = await this.prisma.registration.findUnique({
      where: { id: input.registrationId },
    });
    if (!registration) throw new NotFoundException('Inscription introuvable');
    this.tenantAccess.assertOrganizationAccess(actor, registration.organizationId);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const license = await tx.license.create({
        data: {
          registrationId: input.registrationId,
          number: input.number.trim().toUpperCase(),
          season: input.season.trim(),
          validFrom: input.validFrom ? new Date(input.validFrom) : undefined,
          validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: registration.organizationId,
          action: 'LICENSE_CREATED',
          resourceType: 'License',
          resourceId: license.id,
        },
      });
      return license;
    });
  }

  async submit(actor: AuthenticatedActor, licenseId: string) {
    const license = await this.getWithRegistration(licenseId);
    this.tenantAccess.assertOrganizationAccess(actor, license.registration.organizationId);
    this.statusWorkflow.assertTransition(license.status, LicenseStatus.SUBMITTED);
    return this.changeStatus(actor, license, LicenseStatus.SUBMITTED);
  }

  async decide(actor: AuthenticatedActor, licenseId: string, input: LicenseDecisionDto) {
    const license = await this.getWithRegistration(licenseId);
    this.statusWorkflow.assertTransition(license.status, input.decision);

    if (input.decision === LicenseStatus.REJECTED && !input.reason?.trim()) {
      throw new BadRequestException('Le motif de rejet est obligatoire');
    }

    return this.changeStatus(actor, license, input.decision, input.reason);
  }

  async suspend(actor: AuthenticatedActor, licenseId: string, reason?: string) {
    const license = await this.getWithRegistration(licenseId);
    this.statusWorkflow.assertTransition(license.status, LicenseStatus.SUSPENDED);
    return this.changeStatus(actor, license, LicenseStatus.SUSPENDED, reason);
  }

  private async getWithRegistration(licenseId: string) {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
      include: { registration: true },
    });
    if (!license) throw new NotFoundException('Licence introuvable');
    return license;
  }

  private async changeStatus(
    actor: AuthenticatedActor,
    license: Awaited<ReturnType<LicensesService['getWithRegistration']>>,
    status: LicenseStatus,
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.license.update({
        where: { id: license.id },
        data: {
          status,
          rejectionReason: status === LicenseStatus.REJECTED ? reason?.trim() : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: license.registration.organizationId,
          action: `LICENSE_${status}`,
          resourceType: 'License',
          resourceId: license.id,
          metadata: reason ? { reason: reason.trim() } : undefined,
        },
      });
      return updated;
    });
  }
}
