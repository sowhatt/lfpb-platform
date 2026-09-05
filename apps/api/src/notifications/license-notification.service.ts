import { Injectable, Logger } from '@nestjs/common';
import { LicenseStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type NotificationChannel = 'WHATSAPP' | 'SMS';

export interface LicenseNotificationInput {
  licenseId: string;
  organizationId: string;
  playerName: string;
  status: LicenseStatus;
  reason?: string;
}

@Injectable()
export class LicenseNotificationService {
  private readonly logger = new Logger(LicenseNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notifyClub(input: LicenseNotificationInput): Promise<void> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { code: true, name: true },
    });

    if (!organization) return;

    const channel = this.notificationChannel();
    const recipient = this.recipientFor(organization.code);
    const message = this.messageFor(input, organization.name);
    const webhookUrl = process.env.LFPB_NOTIFICATION_WEBHOOK_URL?.trim();

    let deliveryStatus: 'QUEUED' | 'SENT' | 'SKIPPED' | 'FAILED' = 'QUEUED';
    let failureReason: string | undefined;

    if (!recipient) {
      deliveryStatus = 'SKIPPED';
      failureReason = `Aucun numéro configuré pour ${organization.code}`;
    } else if (!webhookUrl) {
      deliveryStatus = 'QUEUED';
      this.logger.log(`[${channel}] ${recipient} :: ${message}`);
    } else {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            channel,
            recipient,
            message,
            event: 'LICENSE_STATUS_CHANGED',
            licenseId: input.licenseId,
            organizationId: input.organizationId,
            status: input.status,
          }),
        });

        if (!response.ok) {
          deliveryStatus = 'FAILED';
          failureReason = `HTTP ${response.status}`;
        } else {
          deliveryStatus = 'SENT';
        }
      } catch (error) {
        deliveryStatus = 'FAILED';
        failureReason = error instanceof Error ? error.message : 'Erreur de notification';
      }
    }

    await this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        action: 'LICENSE_NOTIFICATION',
        resourceType: 'License',
        resourceId: input.licenseId,
        metadata: {
          channel,
          recipient: recipient ?? null,
          status: input.status,
          deliveryStatus,
          failureReason: failureReason ?? null,
          // Ne jamais inclure le contenu des pièces jointes dans les notifications externes.
          message,
        },
      },
    });
  }

  private notificationChannel(): NotificationChannel {
    return process.env.LFPB_NOTIFICATION_CHANNEL?.toUpperCase() === 'SMS'
      ? 'SMS'
      : 'WHATSAPP';
  }

  private recipientFor(organizationCode: string): string | undefined {
    const normalizedCode = organizationCode.replace(/[^A-Z0-9]/gi, '_').toUpperCase();
    return process.env[`LFPB_NOTIFICATION_PHONE_${normalizedCode}`]?.trim();
  }

  private messageFor(
    input: LicenseNotificationInput,
    clubName: string,
  ): string {
    if (input.status === LicenseStatus.INCOMPLETE) {
      return [
        'LFPB - Dossier de licence à compléter',
        `Joueur : ${input.playerName}`,
        `Club : ${clubName}`,
        `Motif : ${input.reason?.trim() || 'Complément demandé par la LFPB'}`,
        'Connectez-vous à votre Espace Club pour corriger le dossier.',
      ].join('\n');
    }

    if (input.status === LicenseStatus.LEAGUE_FAVORABLE) {
      return [
        'LFPB - Avis favorable',
        `Joueur : ${input.playerName}`,
        `Club : ${clubName}`,
        'Le dossier a reçu un avis favorable de la LFPB.',
      ].join('\n');
    }

    if (input.status === LicenseStatus.ISSUED_BY_FBF) {
      return [
        'LFPB - Licence délivrée par la FBF',
        `Joueur : ${input.playerName}`,
        `Club : ${clubName}`,
        'La licence a été délivrée par la Fédération Béninoise de Football.',
      ].join('\n');
    }

    if (input.status === LicenseStatus.REJECTED_BY_FBF) {
      return [
        'LFPB - Licence refusée par la FBF',
        `Joueur : ${input.playerName}`,
        `Club : ${clubName}`,
        `Motif : ${input.reason?.trim() || 'Refus fédéral'}`,
        'Connectez-vous à votre Espace Club pour consulter le dossier.',
      ].join('\n');
    }

    return [
      'LFPB - Mise à jour du dossier de licence',
      `Joueur : ${input.playerName}`,
      `Club : ${clubName}`,
      `Statut : ${input.status}`,
    ].join('\n');
  }
}
