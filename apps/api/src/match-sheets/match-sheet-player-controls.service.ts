import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MatchOfficialAssignmentStatus,
  MatchOfficialRole,
  MatchSheetStatus,
  Role,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import {
  ControlMatchSheetPlayerDto,
  MatchSheetPlayerControlStatus,
} from './dto/control-match-sheet-player.dto';

const CONTROL_RESOURCE = 'MatchSheetPlayerControl';
const CONTROL_PREFIX = 'MATCH_SHEET_PLAYER_CONTROL_';
const PHOTO_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i;

@Injectable()
export class MatchSheetPlayerControlsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedActor, matchId: string) {
    await this.assertCanRead(actor, matchId);

    const sheet = await this.prisma.matchSheet.findUnique({
      where: { matchId },
      include: {
        players: {
          select: {
            id: true,
            registrationId: true,
            clubId: true,
            side: true,
            role: true,
            shirtNumber: true,
          },
        },
      },
    });

    if (!sheet) throw new NotFoundException('Feuille de match introuvable');

    const logs = sheet.players.length
      ? await this.prisma.auditLog.findMany({
          where: {
            resourceType: CONTROL_RESOURCE,
            resourceId: { in: sheet.players.map((player) => player.id) },
            action: { startsWith: CONTROL_PREFIX },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const latestByPlayer = new Map<string, (typeof logs)[number]>();
    for (const log of logs) {
      if (log.resourceId && !latestByPlayer.has(log.resourceId)) latestByPlayer.set(log.resourceId, log);
    }

    const controls = sheet.players.map((player) => {
      const log = latestByPlayer.get(player.id);
      const metadata = (log?.metadata && typeof log.metadata === 'object' ? log.metadata : {}) as Record<string, unknown>;
      const status = log ? log.action.slice(CONTROL_PREFIX.length) : 'PENDING';
      return {
        matchSheetPlayerId: player.id,
        registrationId: player.registrationId,
        clubId: player.clubId,
        side: player.side,
        role: player.role,
        shirtNumber: player.shirtNumber,
        status,
        controlledAt: log?.createdAt ?? null,
        controlledByUserId: log?.actorUserId ?? null,
        reason: typeof metadata.reason === 'string' ? metadata.reason : null,
        note: typeof metadata.note === 'string' ? metadata.note : null,
        evidencePhotoDataUrl: typeof metadata.evidencePhotoDataUrl === 'string' ? metadata.evidencePhotoDataUrl : null,
        evidencePhotoSha256: typeof metadata.evidencePhotoSha256 === 'string' ? metadata.evidencePhotoSha256 : null,
        evidencePhotoMimeType: typeof metadata.evidencePhotoMimeType === 'string' ? metadata.evidencePhotoMimeType : null,
      };
    });

    const verified = controls.filter((control) => control.status === MatchSheetPlayerControlStatus.VERIFIED).length;
    const anomalies = controls.filter((control) => control.status === MatchSheetPlayerControlStatus.ANOMALY).length;

    return {
      matchId,
      sheetId: sheet.id,
      sheetStatus: sheet.status,
      total: controls.length,
      verified,
      anomalies,
      pending: controls.length - verified - anomalies,
      complete: controls.length > 0 && verified === controls.length,
      controls,
    };
  }

  async controlPlayer(actor: AuthenticatedActor, matchId: string, registrationId: string, input: ControlMatchSheetPlayerDto) {
    await this.assertCanControlPlayers(actor, matchId);

    const sheet = await this.prisma.matchSheet.findUnique({
      where: { matchId },
      include: {
        match: { include: { competition: { select: { organizationId: true } } } },
        players: {
          where: { registrationId },
          select: { id: true, registrationId: true, clubId: true, side: true, role: true, shirtNumber: true },
        },
      },
    });

    if (!sheet) throw new NotFoundException('Feuille de match introuvable');
    if (sheet.status === MatchSheetStatus.LOCKED) throw new BadRequestException('La feuille de match est déjà verrouillée');
    if (sheet.status !== MatchSheetStatus.SUBMITTED) throw new BadRequestException('Les deux clubs doivent soumettre la feuille avant le contrôle terrain');

    const player = sheet.players[0];
    if (!player) throw new NotFoundException('Ce joueur ne figure pas sur la feuille de match');

    const reason = input.reason?.trim() || null;
    if (input.status === MatchSheetPlayerControlStatus.ANOMALY && !reason) {
      throw new BadRequestException('Le motif est obligatoire pour signaler une anomalie');
    }

    let evidencePhotoDataUrl: string | null = null;
    let evidencePhotoSha256: string | null = null;
    let evidencePhotoMimeType: string | null = null;
    if (input.evidencePhotoDataUrl) {
      if (input.status !== MatchSheetPlayerControlStatus.ANOMALY) {
        throw new BadRequestException('Une photo de preuve est réservée au signalement d’anomalie');
      }
      const match = PHOTO_PATTERN.exec(input.evidencePhotoDataUrl);
      if (!match) throw new BadRequestException('La photo doit être au format JPEG, PNG ou WebP');
      const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
      if (!bytes.length || bytes.byteLength > 1_800_000) throw new BadRequestException('La photo de preuve doit faire moins de 1,8 Mo');
      evidencePhotoDataUrl = input.evidencePhotoDataUrl;
      evidencePhotoMimeType = match[1].toLowerCase();
      evidencePhotoSha256 = createHash('sha256').update(bytes).digest('hex');
    }

    const log = await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        organizationId: sheet.match.competition.organizationId,
        action: `${CONTROL_PREFIX}${input.status}`,
        resourceType: CONTROL_RESOURCE,
        resourceId: player.id,
        metadata: {
          matchId,
          sheetId: sheet.id,
          registrationId,
          clubId: player.clubId,
          side: player.side,
          role: player.role,
          shirtNumber: player.shirtNumber,
          reason,
          note: input.note?.trim() || null,
          evidencePhotoDataUrl,
          evidencePhotoSha256,
          evidencePhotoMimeType,
        },
      },
    });

    return {
      matchSheetPlayerId: player.id,
      registrationId,
      status: input.status,
      controlledAt: log.createdAt,
      controlledByUserId: actor.userId,
      reason,
      note: input.note?.trim() || null,
      evidencePhotoDataUrl,
      evidencePhotoSha256,
      evidencePhotoMimeType,
    };
  }

  async assertAllVerified(actor: AuthenticatedActor, matchId: string) {
    const summary = await this.list(actor, matchId);
    if (!summary.complete) {
      throw new BadRequestException(`Contrôle terrain incomplet : ${summary.verified}/${summary.total} joueur(s) vérifié(s), ${summary.anomalies} anomalie(s), ${summary.pending} en attente`);
    }
    return summary;
  }

  private async assertCanRead(
    actor: AuthenticatedActor,
    matchId: string,
  ) {
    const isLeagueAdmin = actor.memberships.some(
      (membership) => membership.role === Role.LIGUE_ADMIN,
    );

    if (isLeagueAdmin) return;

    await this.getAcceptedOfficialAssignment(actor, matchId);
  }

  private async assertCanControlPlayers(
    actor: AuthenticatedActor,
    matchId: string,
  ) {
    const isLeagueAdmin = actor.memberships.some(
      (membership) => membership.role === Role.LIGUE_ADMIN,
    );

    if (isLeagueAdmin) return;

    const assignment = await this.getAcceptedOfficialAssignment(
      actor,
      matchId,
    );

    if (assignment.role !== MatchOfficialRole.REFEREE) {
      throw new ForbiddenException(
        'Seul l’arbitre central désigné peut valider le contrôle terrain des joueurs',
      );
    }
  }

  private async getAcceptedOfficialAssignment(
    actor: AuthenticatedActor,
    matchId: string,
  ) {
    const isOfficial = actor.memberships.some(
      (membership) => membership.role === Role.OFFICIEL,
    );

    if (!isOfficial) {
      throw new ForbiddenException(
        'Seul un officiel désigné peut accéder au contrôle des joueurs',
      );
    }

    const official = await this.prisma.officialProfile.findUnique({
      where: { userId: actor.userId },
      select: { registrationId: true },
    });

    if (!official) {
      throw new ForbiddenException('Profil officiel introuvable');
    }

    const assignment =
      await this.prisma.matchOfficialAssignment.findFirst({
        where: {
          matchId,
          officialProfileId: official.registrationId,
          status: MatchOfficialAssignmentStatus.ACCEPTED,
        },
        select: {
          id: true,
          role: true,
          status: true,
        },
      });

    if (!assignment) {
      throw new ForbiddenException(
        'Cet officiel n’est pas affecté et confirmé sur cette rencontre',
      );
    }

    return assignment;
  }

}
