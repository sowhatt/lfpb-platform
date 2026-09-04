import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, LicenseStatus, Prisma, RegistrationCategory } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import { TenantAccessService } from '../iam/tenant-access.service';
import { CreateLicenseDto } from './dto/create-license.dto';
import { FederationDecisionDto, LeagueReviewDto } from './dto/license-decision.dto';
import { LicenseStatusService } from './license-status.service';

const REQUIRED_PLAYER_DOCUMENTS = [
  { code: 'LICENSE_FORM', label: 'Formulaire de demande de licence signé' },
  { code: 'PAYMENT_PROOF', label: 'Preuve de paiement' },
  { code: 'CLUB_LICENSE_NOTIFICATION', label: 'Notification Licence Nationale du Club' },
  { code: 'MEDICAL_CERTIFICATE', label: 'Certificat médical' },
  { code: 'PHOTO', label: "Photo d'identité récente" },
  { code: 'IDENTITY', label: "Passeport / pièce d'identité" },
  { code: 'INSURANCE', label: "Justificatif d'assurance" },
] as const;

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
        registration: {
          include: { person: true, playerProfile: true, documents: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(actor: AuthenticatedActor, input: CreateLicenseDto) {
    const registration = await this.prisma.registration.findUnique({ where: { id: input.registrationId } });
    if (!registration) throw new NotFoundException('Inscription introuvable');
    this.tenantAccess.assertOrganizationAccess(actor, registration.organizationId);
    if (registration.category !== RegistrationCategory.PLAYER) {
      throw new BadRequestException('Un dossier de licence joueur doit être rattaché à un joueur');
    }
    const season = input.season.trim();
    const existing = await this.prisma.license.findFirst({ where: { registrationId: input.registrationId, season } });
    if (existing) throw new BadRequestException('Un dossier de licence existe déjà pour ce joueur et cette saison');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const license = await tx.license.create({ data: { registrationId: input.registrationId, season } });
      await tx.auditLog.create({
        data: { actorUserId: actor.userId, organizationId: registration.organizationId, action: 'LICENSE_CREATED', resourceType: 'License', resourceId: license.id },
      });
      return license;
    });
  }

  async submit(actor: AuthenticatedActor, licenseId: string) {
    const license = await this.getWithRegistration(licenseId);
    this.tenantAccess.assertOrganizationAccess(actor, license.registration.organizationId);
    this.statusWorkflow.assertTransition(license.status, LicenseStatus.SUBMITTED_TO_LEAGUE);

    const documents = await this.prisma.registrationDocument.findMany({ where: { registrationId: license.registrationId } });
    const invalidStatuses = new Set<DocumentStatus>([DocumentStatus.REJECTED, DocumentStatus.EXPIRED]);
    const acceptedCodes = new Set(
      documents
        .filter((document) => !invalidStatuses.has(document.status))
        .map((document) => this.documentCode(document.storageKey, document.type)),
    );
    const missing = REQUIRED_PLAYER_DOCUMENTS.filter((requirement) => !acceptedCodes.has(requirement.code));
    if (missing.length) {
      throw new BadRequestException(`Dossier incomplet : pièces obligatoires manquantes : ${missing.map((item) => item.label).join(', ')}`);
    }

    return this.changeStatus(actor, license, LicenseStatus.SUBMITTED_TO_LEAGUE);
  }

  async reviewByLeague(actor: AuthenticatedActor, licenseId: string, input: LeagueReviewDto) {
    const license = await this.getWithRegistration(licenseId);
    this.statusWorkflow.assertTransition(license.status, input.decision);

    if (input.decision === LicenseStatus.INCOMPLETE && !input.reason?.trim()) {
      throw new BadRequestException('Les compléments demandés doivent être précisés');
    }

    if (input.decision === LicenseStatus.LEAGUE_FAVORABLE) {
      const documents = await this.prisma.registrationDocument.findMany({
        where: { registrationId: license.registrationId },
      });

      const validatedCodes = new Set(
        documents
          .filter((document) => document.status === DocumentStatus.VALID)
          .map((document) => this.documentCode(document.storageKey, document.type)),
      );

      const notValidated = REQUIRED_PLAYER_DOCUMENTS.filter(
        (requirement) => !validatedCodes.has(requirement.code),
      );

      if (notValidated.length) {
        throw new BadRequestException(
          `Avis favorable impossible : pièces non validées : ${notValidated
            .map((item) => item.label)
            .join(', ')}`,
        );
      }
    }

    return this.changeStatus(actor, license, input.decision, input.reason);
  }

  async transmitToFederation(actor: AuthenticatedActor, licenseId: string) {
    const license = await this.getWithRegistration(licenseId);
    this.statusWorkflow.assertTransition(license.status, LicenseStatus.TRANSMITTED_TO_FBF);
    return this.changeStatus(actor, license, LicenseStatus.TRANSMITTED_TO_FBF);
  }

  async decideByFederation(actor: AuthenticatedActor, licenseId: string, input: FederationDecisionDto) {
    const license = await this.getWithRegistration(licenseId);
    this.statusWorkflow.assertTransition(license.status, input.decision);
    if (input.decision === LicenseStatus.ISSUED_BY_FBF && !input.number?.trim()) throw new BadRequestException('Le numéro de licence FBF est obligatoire');
    if (input.decision === LicenseStatus.REJECTED_BY_FBF && !input.reason?.trim()) throw new BadRequestException('Le motif du refus fédéral est obligatoire');
    return this.changeStatus(actor, license, input.decision, input.reason, {
      number: input.number?.trim().toUpperCase(),
      validFrom: input.validFrom ? new Date(input.validFrom) : undefined,
      validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
    });
  }

  async suspend(actor: AuthenticatedActor, licenseId: string, reason?: string) {
    const license = await this.getWithRegistration(licenseId);
    this.statusWorkflow.assertTransition(license.status, LicenseStatus.SUSPENDED);
    return this.changeStatus(actor, license, LicenseStatus.SUSPENDED, reason);
  }

  async cancel(actor: AuthenticatedActor, licenseId: string, reason?: string) {
    const license = await this.getWithRegistration(licenseId);
    this.statusWorkflow.assertTransition(license.status, LicenseStatus.CANCELLED);
    return this.changeStatus(actor, license, LicenseStatus.CANCELLED, reason);
  }

  private documentCode(storageKey: string, type: string) {
    const marker = storageKey.indexOf('::');
    if (marker > 0) return storageKey.slice(0, marker);
    if (type === 'IDENTITY') return 'IDENTITY';
    if (type === 'PHOTO') return 'PHOTO';
    if (type === 'MEDICAL_CERTIFICATE') return 'MEDICAL_CERTIFICATE';
    if (type === 'CONTRACT') return 'CONTRACT';
    if (type === 'TRANSFER_CLEARANCE') return 'TRANSFER_CLEARANCE';
    return 'OTHER';
  }

  private async getWithRegistration(licenseId: string) {
    const license = await this.prisma.license.findUnique({ where: { id: licenseId }, include: { registration: true } });
    if (!license) throw new NotFoundException('Licence introuvable');
    return license;
  }

  private async changeStatus(
    actor: AuthenticatedActor,
    license: Awaited<ReturnType<LicensesService['getWithRegistration']>>,
    status: LicenseStatus,
    reason?: string,
    federationData?: { number?: string; validFrom?: Date; validUntil?: Date },
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.license.update({
        where: { id: license.id },
        data: {
          status,
          rejectionReason: status === LicenseStatus.INCOMPLETE || status === LicenseStatus.REJECTED_BY_FBF ? reason?.trim() : null,
          ...federationData,
        },
      });
      await tx.auditLog.create({
        data: { actorUserId: actor.userId, organizationId: license.registration.organizationId, action: `LICENSE_${status}`, resourceType: 'License', resourceId: license.id, metadata: reason ? { reason: reason.trim() } : undefined },
      });
      return updated;
    });
  }
}
