import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MatchHomologationStatus,
  MatchOfficialAssignmentStatus,
  MatchSheetStatus,
  MatchStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import {
  MatchSheetSignatureRole,
  SignMatchSheetDto,
} from './dto/sign-match-sheet.dto';

const ACTION = 'MATCH_SHEET_SIGNED';
const CLOSURE_ACTION = 'MATCH_OFFICIALLY_CLOSED';
const EVENT_ACTION_PREFIX = 'MATCH_EVENT_';

type SignatureMetadata = {
  matchId?: string;
  role?: MatchSheetSignatureRole;
  signerName?: string;
  signerFunction?: string | null;
  signedAt?: string;
  sheetFingerprint?: string;
  reportFingerprint?: string;
  fingerprintVersion?: number;
};

@Injectable()
export class MatchSheetSignaturesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedActor, matchId: string) {
    const sheet = await this.loadSheet(matchId);

    await this.assertCanRead(
      actor,
      sheet.match.homeClub.organizationId,
      sheet.match.awayClub.organizationId,
    );

    const logs = await this.prisma.auditLog.findMany({
      where: {
        resourceType: 'MatchSheetSignature',
        resourceId: sheet.id,
        action: ACTION,
      },
      orderBy: { createdAt: 'asc' },
    });

    const signatures = logs.map((log) => ({
      id: log.id,
      ...(log.metadata as SignatureMetadata),
      createdAt: log.createdAt,
    }));

    const closure = await this.prisma.auditLog.findFirst({
      where: {
        resourceType: 'MatchOfficialClosure',
        resourceId: matchId,
        action: CLOSURE_ACTION,
      },
      orderBy: { createdAt: 'desc' },
    });

    const currentReportFingerprint =
      sheet.match.status === MatchStatus.COMPLETED
        ? await this.buildReportFingerprint(sheet)
        : null;

    const signaturesConsistent =
      currentReportFingerprint !== null &&
      signatures.every(
        (signature) =>
          signature.reportFingerprint === currentReportFingerprint,
      );

    return {
      matchId,
      sheetId: sheet.id,
      matchStatus: sheet.match.status,
      sheetStatus: sheet.status,
      lockedAt: sheet.lockedAt,
      homeClub: {
        organizationId: sheet.match.homeClub.organizationId,
        name: sheet.match.homeClub.shortName,
      },
      awayClub: {
        organizationId: sheet.match.awayClub.organizationId,
        name: sheet.match.awayClub.shortName,
      },
      signatures,
      homeSigned: signatures.some(
        (s) => s.role === MatchSheetSignatureRole.HOME_REPRESENTATIVE,
      ),
      awaySigned: signatures.some(
        (s) => s.role === MatchSheetSignatureRole.AWAY_REPRESENTATIVE,
      ),
      officialSigned: signatures.some(
        (s) => s.role === MatchSheetSignatureRole.OFFICIAL,
      ),
      currentReportFingerprint,
      signaturesConsistent,
      officiallyClosed: Boolean(closure),
      closedAt: closure?.createdAt ?? null,
      closureFingerprint:
        (closure?.metadata as { reportFingerprint?: string } | null)
          ?.reportFingerprint ?? null,
      readyForSignatures:
        !closure &&
        sheet.status === MatchSheetStatus.LOCKED &&
        sheet.match.status === MatchStatus.COMPLETED,
    };
  }

  async sign(
    actor: AuthenticatedActor,
    matchId: string,
    input: SignMatchSheetDto,
  ) {
    const sheet = await this.loadSheet(matchId);

    if (sheet.status !== MatchSheetStatus.LOCKED) {
      throw new BadRequestException(
        'La feuille doit être verrouillée avant signature',
      );
    }

    if (sheet.match.status !== MatchStatus.COMPLETED) {
      throw new BadRequestException(
        'Le match doit être terminé avant la signature du rapport officiel',
      );
    }

    const closure = await this.prisma.auditLog.findFirst({
      where: {
        resourceType: 'MatchOfficialClosure',
        resourceId: matchId,
        action: CLOSURE_ACTION,
      },
    });

    if (closure) {
      throw new BadRequestException(
        'Le rapport officiel est définitivement clôturé',
      );
    }

    await this.assertCanSign(
      actor,
      matchId,
      input.role,
      sheet.match.homeClub.organizationId,
      sheet.match.awayClub.organizationId,
    );

    const existing = await this.prisma.auditLog.findMany({
      where: {
        resourceType: 'MatchSheetSignature',
        resourceId: sheet.id,
        action: ACTION,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (
      existing.some(
        (log) =>
          (log.metadata as SignatureMetadata)?.role === input.role,
      )
    ) {
      throw new BadRequestException(
        'Cette signature a déjà été enregistrée',
      );
    }

    const reportFingerprint = await this.buildReportFingerprint(sheet);

    const previousFingerprints = existing
      .map(
        (log) =>
          (log.metadata as SignatureMetadata)?.reportFingerprint,
      )
      .filter((value): value is string => Boolean(value));

    if (
      previousFingerprints.some(
        (fingerprint) => fingerprint !== reportFingerprint,
      )
    ) {
      throw new BadRequestException(
        'Le rapport officiel a changé depuis une signature précédente. Le circuit de signature doit être réinitialisé avant de poursuivre.',
      );
    }

    if (input.role === MatchSheetSignatureRole.OFFICIAL) {
      const roles = existing.map(
        (log) => (log.metadata as SignatureMetadata)?.role,
      );

      if (
        !roles.includes(
          MatchSheetSignatureRole.HOME_REPRESENTATIVE,
        ) ||
        !roles.includes(
          MatchSheetSignatureRole.AWAY_REPRESENTATIVE,
        )
      ) {
        throw new BadRequestException(
          'Les représentants des deux clubs doivent signer avant l’officiel',
        );
      }

      const clubFingerprints = existing
        .filter((log) => {
          const role = (log.metadata as SignatureMetadata)?.role;
          return (
            role === MatchSheetSignatureRole.HOME_REPRESENTATIVE ||
            role === MatchSheetSignatureRole.AWAY_REPRESENTATIVE
          );
        })
        .map(
          (log) =>
            (log.metadata as SignatureMetadata)?.reportFingerprint,
        );

      if (
        clubFingerprints.length !== 2 ||
        clubFingerprints.some(
          (fingerprint) => fingerprint !== reportFingerprint,
        )
      ) {
        throw new BadRequestException(
          'Les signatures des clubs ne correspondent pas à la version actuelle du rapport officiel',
        );
      }
    }

    const signedAt = new Date();

    const organizationId =
      input.role === MatchSheetSignatureRole.HOME_REPRESENTATIVE
        ? sheet.match.homeClub.organizationId
        : input.role === MatchSheetSignatureRole.AWAY_REPRESENTATIVE
          ? sheet.match.awayClub.organizationId
          : sheet.match.competition.organizationId;

    const log = await this.prisma.$transaction(
      async (tx) => {
        const signature = await tx.auditLog.create({
          data: {
            actorUserId: actor.userId,
            organizationId,
            action: ACTION,
            resourceType: 'MatchSheetSignature',
            resourceId: sheet.id,
            metadata: {
              matchId,
              role: input.role,
              signerName: input.signerName.trim(),
              signerFunction: input.signerFunction?.trim() || null,
              signedAt: signedAt.toISOString(),
              sheetFingerprint: reportFingerprint,
              reportFingerprint,
              fingerprintVersion: 3,
            },
          },
        });

        if (input.role === MatchSheetSignatureRole.OFFICIAL) {
          await tx.auditLog.create({
            data: {
              actorUserId: actor.userId,
              organizationId: sheet.match.competition.organizationId,
              action: CLOSURE_ACTION,
              resourceType: 'MatchOfficialClosure',
              resourceId: matchId,
              metadata: {
                matchId,
                sheetId: sheet.id,
                officialSignatureId: signature.id,
                closedAt: signedAt.toISOString(),
                reportFingerprint,
                fingerprintVersion: 3,
              },
            },
          });

          await tx.match.update({
            where: { id: matchId },
            data: {
              homologationStatus: MatchHomologationStatus.PENDING,
              officialHomeScore: null,
              officialAwayScore: null,
              homologationReason: null,
              homologatedAt: null,
              homologatedByUserId: null,
            },
          });

        }

        return signature;
      },
    );

    return {
      id: log.id,
      ...(log.metadata as SignatureMetadata),
      officiallyClosed:
        input.role === MatchSheetSignatureRole.OFFICIAL,
    };
  }

  private async buildReportFingerprint(
    sheet: Awaited<ReturnType<MatchSheetSignaturesService['loadSheet']>>,
  ) {
    const events = await this.prisma.auditLog.findMany({
      where: {
        resourceType: 'MatchEvent',
        resourceId: sheet.matchId,
        action: { startsWith: EVENT_ACTION_PREFIX },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const postMatchEntries = await this.prisma.auditLog.findMany({
      where: {
        resourceType: 'MatchPostMatchEntry',
        resourceId: sheet.matchId,
        action: { startsWith: 'MATCH_POST_MATCH_' },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const fingerprintSource = JSON.stringify({
      version: 3,
      matchId: sheet.matchId,
      sheetId: sheet.id,
      lockedAt: sheet.lockedAt?.toISOString() ?? null,
      matchStatus: sheet.match.status,
      homeClubId: sheet.match.homeClubId,
      awayClubId: sheet.match.awayClubId,
      homeScore: sheet.match.homeScore ?? 0,
      awayScore: sheet.match.awayScore ?? 0,
      players: sheet.players.map((player) => ({
        registrationId: player.registrationId,
        clubId: player.clubId,
        side: player.side,
        role: player.role,
        shirtNumber: player.shirtNumber,
      })),
      events: events.map((event) => ({
        id: event.id,
        action: event.action,
        createdAt: event.createdAt.toISOString(),
        metadata: event.metadata ?? null,
      })),
      postMatchEntries: postMatchEntries.map((entry) => ({
        id: entry.id,
        action: entry.action,
        createdAt: entry.createdAt.toISOString(),
        metadata: entry.metadata ?? null,
      })),
    });

    return createHash('sha256')
      .update(fingerprintSource)
      .digest('hex');
  }

  private loadSheet(matchId: string) {
    return this.prisma.matchSheet
      .findUnique({
        where: { matchId },
        include: {
          players: {
            orderBy: [
              { side: 'asc' },
              { shirtNumber: 'asc' },
            ],
          },
          match: {
            include: {
              homeClub: true,
              awayClub: true,
              competition: true,
            },
          },
        },
      })
      .then((sheet) => {
        if (!sheet) {
          throw new NotFoundException(
            'Feuille de match introuvable',
          );
        }
        return sheet;
      });
  }

  private async assertCanRead(
    actor: AuthenticatedActor,
    homeOrgId: string,
    awayOrgId: string,
  ) {
    const allowed = actor.memberships.some(
      (membership) =>
        membership.role === Role.LIGUE_ADMIN ||
        membership.role === Role.OFFICIEL ||
        (membership.role === Role.CLUB_ADMIN &&
          [homeOrgId, awayOrgId].includes(
            membership.organizationId,
          )),
    );

    if (!allowed) {
      throw new ForbiddenException(
        'Accès interdit aux signatures de cette feuille',
      );
    }
  }

  private async assertCanSign(
    actor: AuthenticatedActor,
    matchId: string,
    role: MatchSheetSignatureRole,
    homeOrgId: string,
    awayOrgId: string,
  ) {
    if (
      role === MatchSheetSignatureRole.HOME_REPRESENTATIVE ||
      role === MatchSheetSignatureRole.AWAY_REPRESENTATIVE
    ) {
      const target =
        role === MatchSheetSignatureRole.HOME_REPRESENTATIVE
          ? homeOrgId
          : awayOrgId;

      if (
        !actor.memberships.some(
          (membership) =>
            membership.role === Role.CLUB_ADMIN &&
            membership.organizationId === target,
        )
      ) {
        throw new ForbiddenException(
          'Seul le représentant du club concerné peut signer',
        );
      }

      return;
    }

    if (
      actor.memberships.some(
        (membership) => membership.role === Role.LIGUE_ADMIN,
      )
    ) {
      return;
    }

    if (
      !actor.memberships.some(
        (membership) => membership.role === Role.OFFICIEL,
      )
    ) {
      throw new ForbiddenException(
        'Seul un officiel confirmé peut signer',
      );
    }

    const profile =
      await this.prisma.officialProfile.findUnique({
        where: { userId: actor.userId },
      });

    if (!profile) {
      throw new ForbiddenException(
        'Profil officiel introuvable',
      );
    }

    const assignment =
      await this.prisma.matchOfficialAssignment.findFirst({
        where: {
          matchId,
          officialProfileId: profile.registrationId,
          status: MatchOfficialAssignmentStatus.ACCEPTED,
        },
      });

    if (!assignment) {
      throw new ForbiddenException(
        'Cet officiel n’est pas confirmé sur cette rencontre',
      );
    }
  }
}
