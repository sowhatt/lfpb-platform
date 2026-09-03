import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentAnalysisStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import { TenantAccessService } from '../iam/tenant-access.service';

export type ExtractedDocumentData = {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  birthDate?: string;
  nationality?: string;
  documentNumber?: string;
  documentType?: string;
  issueDate?: string;
  expiryDate?: string;
  medicalCertificateDate?: string;
};

type FieldComparison = {
  field: string;
  expected: string | null;
  extracted: string | null;
  match: boolean | null;
  confidence: number;
};

@Injectable()
export class DocumentIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async ensurePending(documentId: string) {
    return this.prisma.documentAnalysis.upsert({
      where: { documentId },
      create: { documentId, status: DocumentAnalysisStatus.PENDING },
      update: {},
    });
  }

  async get(actor: AuthenticatedActor, documentId: string) {
    const document = await this.getAuthorizedDocument(actor, documentId);
    return {
      documentId: document.id,
      itemCode: this.itemCode(document.storageKey),
      analysis: document.analysis,
    };
  }

  async evaluate(
    actor: AuthenticatedActor,
    documentId: string,
    extracted: ExtractedDocumentData,
    provider = 'manual-or-external',
    model?: string,
    rawText?: string,
  ) {
    const document = await this.getAuthorizedDocument(actor, documentId);
    const person = document.registration.person;
    const comparisons: FieldComparison[] = [];
    const alerts: Array<{ code: string; severity: 'INFO' | 'WARNING' | 'ERROR'; message: string }> = [];

    const expectedFullName = `${person.firstName} ${person.lastName}`.trim();
    const extractedFullName = (extracted.fullName ?? `${extracted.firstName ?? ''} ${extracted.lastName ?? ''}`).trim();

    if (extractedFullName) {
      const score = this.similarity(expectedFullName, extractedFullName);
      comparisons.push({
        field: 'fullName',
        expected: expectedFullName,
        extracted: extractedFullName,
        match: score >= 0.82,
        confidence: score,
      });
      if (score < 0.82) alerts.push({ code: 'NAME_MISMATCH', severity: 'ERROR', message: 'Le nom extrait ne correspond pas suffisamment à la fiche joueur.' });
    }

    if (person.birthDate && extracted.birthDate) {
      const expected = this.isoDate(person.birthDate);
      const actual = this.parseDate(extracted.birthDate);
      const match = Boolean(actual && expected === actual);
      comparisons.push({ field: 'birthDate', expected, extracted: actual ?? extracted.birthDate, match, confidence: match ? 1 : 0 });
      if (!match) alerts.push({ code: 'BIRTH_DATE_MISMATCH', severity: 'ERROR', message: 'La date de naissance extraite diffère de la fiche joueur.' });
    }

    if (person.nationality && extracted.nationality) {
      const score = this.similarity(person.nationality, extracted.nationality);
      comparisons.push({
        field: 'nationality',
        expected: person.nationality,
        extracted: extracted.nationality,
        match: score >= 0.85,
        confidence: score,
      });
      if (score < 0.85) alerts.push({ code: 'NATIONALITY_MISMATCH', severity: 'WARNING', message: 'La nationalité extraite diffère de la fiche joueur.' });
    }

    const itemCode = this.itemCode(document.storageKey);
    if (itemCode === 'MEDICAL_CERTIFICATE' && extracted.medicalCertificateDate) {
      const certificateDate = this.parseDate(extracted.medicalCertificateDate);
      if (!certificateDate) {
        alerts.push({ code: 'INVALID_MEDICAL_DATE', severity: 'ERROR', message: 'La date du certificat médical n’a pas pu être interprétée.' });
      } else {
        const ageDays = Math.floor((Date.now() - new Date(`${certificateDate}T00:00:00Z`).getTime()) / 86_400_000);
        comparisons.push({
          field: 'medicalCertificateDate',
          expected: 'moins de 3 mois',
          extracted: certificateDate,
          match: ageDays >= 0 && ageDays <= 92,
          confidence: 1,
        });
        if (ageDays < 0) alerts.push({ code: 'MEDICAL_DATE_IN_FUTURE', severity: 'ERROR', message: 'La date du certificat médical est dans le futur.' });
        if (ageDays > 92) alerts.push({ code: 'MEDICAL_CERTIFICATE_TOO_OLD', severity: 'ERROR', message: 'Le certificat médical a plus de 3 mois.' });
      }
    }

    if (extracted.expiryDate) {
      const expiry = this.parseDate(extracted.expiryDate);
      if (expiry && new Date(`${expiry}T23:59:59Z`).getTime() < Date.now()) {
        alerts.push({ code: 'DOCUMENT_EXPIRED', severity: 'ERROR', message: 'Le document extrait est expiré.' });
      }
    }

    const scored = comparisons.filter((comparison) => comparison.match !== null);
    const confidence = scored.length
      ? scored.reduce((sum, comparison) => sum + comparison.confidence, 0) / scored.length
      : 0.5;
    const hasErrors = alerts.some((alert) => alert.severity === 'ERROR');
    const status = hasErrors
      ? DocumentAnalysisStatus.NON_COMPLIANT
      : confidence >= 0.85
        ? DocumentAnalysisStatus.CONSISTENT
        : DocumentAnalysisStatus.REVIEW_REQUIRED;

    const analysis = await this.prisma.documentAnalysis.upsert({
      where: { documentId },
      create: {
        documentId,
        status,
        provider,
        model,
        confidence,
        extractedData: extracted as Prisma.InputJsonValue,
        comparisonResult: comparisons as unknown as Prisma.InputJsonValue,
        alerts: alerts as unknown as Prisma.InputJsonValue,
        rawText,
        analyzedAt: new Date(),
      },
      update: {
        status,
        provider,
        model,
        confidence,
        extractedData: extracted as Prisma.InputJsonValue,
        comparisonResult: comparisons as unknown as Prisma.InputJsonValue,
        alerts: alerts as unknown as Prisma.InputJsonValue,
        rawText,
        analyzedAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        organizationId: document.registration.organizationId,
        action: 'LICENSE_DOCUMENT_ANALYZED',
        resourceType: 'RegistrationDocument',
        resourceId: document.id,
        metadata: { itemCode, status, confidence, alertCount: alerts.length, provider },
      },
    });

    return analysis;
  }

  private async getAuthorizedDocument(actor: AuthenticatedActor, documentId: string) {
    const document = await this.prisma.registrationDocument.findUnique({
      where: { id: documentId },
      include: { analysis: true, registration: { include: { person: true } } },
    });
    if (!document) throw new NotFoundException('Pièce introuvable');
    this.tenantAccess.assertOrganizationAccess(actor, document.registration.organizationId);
    return document;
  }

  private itemCode(storageKey: string) {
    const marker = storageKey.indexOf('::');
    return marker > 0 ? storageKey.slice(0, marker) : 'OTHER';
  }

  private normalize(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private similarity(left: string, right: string) {
    const a = this.normalize(left);
    const b = this.normalize(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const maxLength = Math.max(a.length, b.length);
    return 1 - this.levenshtein(a, b) / maxLength;
  }

  private levenshtein(a: string, b: string) {
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const old = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = old;
      }
    }
    return row[b.length];
  }

  private parseDate(value: string) {
    const trimmed = value.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const fr = /^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/.exec(trimmed);
    if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
    return null;
  }

  private isoDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
