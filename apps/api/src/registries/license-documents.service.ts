import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, DocumentType, RegistrationCategory } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import { TenantAccessService } from '../iam/tenant-access.service';
import { DocumentIntelligenceService } from './document-intelligence.service';

type ChecklistItem = {
  code: string;
  label: string;
  type: DocumentType;
  required: boolean;
  condition?: string;
};

const CHECKLIST: ChecklistItem[] = [
  { code: 'LICENSE_FORM', label: 'Formulaire de demande de licence signé', type: DocumentType.OTHER, required: true },
  { code: 'PAYMENT_PROOF', label: 'Preuve de paiement', type: DocumentType.OTHER, required: true },
  { code: 'CLUB_LICENSE_NOTIFICATION', label: 'Notification Licence Nationale du Club', type: DocumentType.OTHER, required: true },
  { code: 'MEDICAL_CERTIFICATE', label: 'Certificat médical de moins de 3 mois', type: DocumentType.MEDICAL_CERTIFICATE, required: true },
  { code: 'PHOTO', label: "Photo d'identité récente", type: DocumentType.PHOTO, required: true },
  { code: 'IDENTITY', label: "Passeport / pièce d'identité", type: DocumentType.IDENTITY, required: true },
  { code: 'INSURANCE', label: "Justificatif d'assurance", type: DocumentType.OTHER, required: true },
  { code: 'CONTRACT', label: 'Contrat professionnel', type: DocumentType.CONTRACT, required: false, condition: 'Si applicable' },
  { code: 'PARENTAL_AUTHORIZATION', label: 'Autorisation parentale', type: DocumentType.OTHER, required: false, condition: 'Joueur mineur' },
  { code: 'TRANSFER_CLEARANCE', label: 'ITC / CNT / libération / prêt', type: DocumentType.TRANSFER_CLEARANCE, required: false, condition: 'Selon le transfert' },
];

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

@Injectable()
export class LicenseDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
    private readonly documentIntelligence: DocumentIntelligenceService,
  ) {}

  async checklist(actor: AuthenticatedActor, registrationId: string) {
    const registration = await this.getPlayerRegistration(actor, registrationId);
    const documents = await this.prisma.registrationDocument.findMany({
      where: { registrationId },
      include: { analysis: true },
      orderBy: { createdAt: 'desc' },
    });

    const items = CHECKLIST.map((item) => {
      const document = documents.find((candidate) => this.documentCode(candidate.storageKey, candidate.type) === item.code);
      return {
        ...item,
        present: Boolean(document),
        documentId: document?.id ?? null,
        status: document?.status ?? null,
        analysisStatus: document?.analysis?.status ?? null,
        analysisConfidence: document?.analysis?.confidence ?? null,
        analysisAlerts: document?.analysis?.alerts ?? null,
        expiresAt: document?.expiresAt ?? null,
        createdAt: document?.createdAt ?? null,
      };
    });

    const requiredItems = items.filter((item) => item.required);
    const completeItems = requiredItems.filter((item) => item.present && item.status !== DocumentStatus.REJECTED && item.status !== DocumentStatus.EXPIRED);

    return {
      registrationId: registration.id,
      totalRequired: requiredItems.length,
      completedRequired: completeItems.length,
      complete: completeItems.length === requiredItems.length,
      items,
    };
  }

  async upload(
    actor: AuthenticatedActor,
    registrationId: string,
    itemCode: string,
    file: { buffer?: Buffer; mimetype?: string; originalname?: string; size?: number } | undefined,
  ) {
    const registration = await this.getPlayerRegistration(actor, registrationId);
    const item = CHECKLIST.find((candidate) => candidate.code === itemCode);
    if (!item) throw new BadRequestException('Type de pièce réglementaire inconnu');
    if (!file?.buffer || !file.mimetype || !file.originalname) throw new BadRequestException('Fichier manquant');
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) throw new BadRequestException('Format accepté : PDF, JPEG, PNG ou WebP');
    if ((file.size ?? file.buffer.length) > 5 * 1024 * 1024) throw new BadRequestException('Le fichier ne doit pas dépasser 5 Mo');

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    const extension = extname(safeName).toLowerCase();
    const relativePath = join('storage', 'license-documents', registrationId, `${randomUUID()}${extension || ''}`);
    const absolutePath = join(process.cwd(), relativePath);
    await mkdir(join(process.cwd(), 'storage', 'license-documents', registrationId), { recursive: true });
    await writeFile(absolutePath, file.buffer);

    const document = await this.prisma.registrationDocument.create({
      data: {
        registrationId,
        type: item.type,
        storageKey: `${item.code}::${relativePath}`,
        status: DocumentStatus.PENDING,
      },
    });

    const analysis = await this.documentIntelligence.ensurePending(document.id);

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        organizationId: registration.organizationId,
        action: 'LICENSE_DOCUMENT_UPLOADED',
        resourceType: 'RegistrationDocument',
        resourceId: document.id,
        metadata: { itemCode: item.code, mimeType: file.mimetype, originalName: safeName, size: file.size ?? file.buffer.length },
      },
    });

    return { document: { ...document, analysis }, checklist: await this.checklist(actor, registrationId) };
  }

  async openDocument(actor: AuthenticatedActor, documentId: string) {
    const document = await this.prisma.registrationDocument.findUnique({
      where: { id: documentId },
      include: { registration: true },
    });

    if (!document) {
      throw new NotFoundException('Pièce introuvable');
    }

    this.tenantAccess.assertOrganizationAccess(
      actor,
      document.registration.organizationId,
    );

    const marker = document.storageKey.indexOf('::');
    const relativePath =
      marker > 0
        ? document.storageKey.slice(marker + 2)
        : document.storageKey;

    const storageRoot = resolve(process.cwd(), 'storage', 'license-documents');
    const absolutePath = resolve(process.cwd(), relativePath);

    if (
      absolutePath !== storageRoot &&
      !absolutePath.startsWith(`${storageRoot}/`)
    ) {
      throw new BadRequestException('Chemin documentaire invalide');
    }

    let buffer: Buffer;

    try {
      buffer = await readFile(absolutePath);
    } catch {
      throw new NotFoundException('Fichier documentaire introuvable');
    }

    const extension = extname(absolutePath).toLowerCase();

    const mimeType =
      extension === '.pdf'
        ? 'application/pdf'
        : extension === '.png'
          ? 'image/png'
          : extension === '.webp'
            ? 'image/webp'
            : extension === '.jpg' || extension === '.jpeg'
              ? 'image/jpeg'
              : 'application/octet-stream';

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        organizationId: document.registration.organizationId,
        action: 'LICENSE_DOCUMENT_OPENED',
        resourceType: 'RegistrationDocument',
        resourceId: document.id,
        metadata: {
          documentType: document.type,
          mimeType,
        },
      },
    });

    return {
      buffer,
      mimeType,
      filename: `document-${document.id}${extension}`,
    };
  }

  private documentCode(storageKey: string, type: DocumentType) {
    const marker = storageKey.indexOf('::');
    if (marker > 0) return storageKey.slice(0, marker);
    if (type === DocumentType.IDENTITY) return 'IDENTITY';
    if (type === DocumentType.PHOTO) return 'PHOTO';
    if (type === DocumentType.MEDICAL_CERTIFICATE) return 'MEDICAL_CERTIFICATE';
    if (type === DocumentType.CONTRACT) return 'CONTRACT';
    if (type === DocumentType.TRANSFER_CLEARANCE) return 'TRANSFER_CLEARANCE';
    return 'OTHER';
  }

  private async getPlayerRegistration(actor: AuthenticatedActor, registrationId: string) {
    const registration = await this.prisma.registration.findUnique({ where: { id: registrationId } });
    if (!registration || registration.category !== RegistrationCategory.PLAYER) throw new NotFoundException('Joueur introuvable');
    this.tenantAccess.assertOrganizationAccess(actor, registration.organizationId);
    return registration;
  }
}
