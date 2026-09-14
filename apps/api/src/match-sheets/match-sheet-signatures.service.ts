import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MatchOfficialAssignmentStatus, MatchSheetStatus, Role } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import { MatchSheetSignatureRole, SignMatchSheetDto } from './dto/sign-match-sheet.dto';

const ACTION = 'MATCH_SHEET_SIGNED';

type SignatureMetadata = {
  matchId?: string;
  role?: MatchSheetSignatureRole;
  signerName?: string;
  signerFunction?: string | null;
  signedAt?: string;
  sheetFingerprint?: string;
};

@Injectable()
export class MatchSheetSignaturesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedActor, matchId: string) {
    const sheet = await this.loadSheet(matchId);
    await this.assertCanRead(actor, sheet.match.homeClub.organizationId, sheet.match.awayClub.organizationId);
    const logs = await this.prisma.auditLog.findMany({
      where: { resourceType: 'MatchSheetSignature', resourceId: sheet.id, action: ACTION },
      orderBy: { createdAt: 'asc' },
    });
    const signatures = logs.map((log) => ({ id: log.id, ...(log.metadata as SignatureMetadata), createdAt: log.createdAt }));
    return {
      matchId,
      sheetId: sheet.id,
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
      homeSigned: signatures.some((s) => s.role === MatchSheetSignatureRole.HOME_REPRESENTATIVE),
      awaySigned: signatures.some((s) => s.role === MatchSheetSignatureRole.AWAY_REPRESENTATIVE),
      officialSigned: signatures.some((s) => s.role === MatchSheetSignatureRole.OFFICIAL),
    };
  }

  async sign(actor: AuthenticatedActor, matchId: string, input: SignMatchSheetDto) {
    const sheet = await this.loadSheet(matchId);
    if (sheet.status !== MatchSheetStatus.LOCKED) throw new BadRequestException('La feuille doit être verrouillée avant signature');
    await this.assertCanSign(actor, matchId, input.role, sheet.match.homeClub.organizationId, sheet.match.awayClub.organizationId);

    const existing = await this.prisma.auditLog.findMany({
      where: { resourceType: 'MatchSheetSignature', resourceId: sheet.id, action: ACTION },
      orderBy: { createdAt: 'asc' },
    });
    if (existing.some((log) => (log.metadata as SignatureMetadata)?.role === input.role)) throw new BadRequestException('Cette signature a déjà été enregistrée');
    if (input.role === MatchSheetSignatureRole.OFFICIAL) {
      const roles = existing.map((log) => (log.metadata as SignatureMetadata)?.role);
      if (!roles.includes(MatchSheetSignatureRole.HOME_REPRESENTATIVE) || !roles.includes(MatchSheetSignatureRole.AWAY_REPRESENTATIVE)) throw new BadRequestException('Les représentants des deux clubs doivent signer avant l’officiel');
    }

    const fingerprintSource = JSON.stringify({
      matchId,
      sheetId: sheet.id,
      lockedAt: sheet.lockedAt?.toISOString() ?? null,
      players: sheet.players.map((p) => ({ registrationId: p.registrationId, clubId: p.clubId, side: p.side, role: p.role, shirtNumber: p.shirtNumber })),
    });
    const sheetFingerprint = createHash('sha256').update(fingerprintSource).digest('hex');
    const signedAt = new Date();
    const organizationId = input.role === MatchSheetSignatureRole.HOME_REPRESENTATIVE
      ? sheet.match.homeClub.organizationId
      : input.role === MatchSheetSignatureRole.AWAY_REPRESENTATIVE
        ? sheet.match.awayClub.organizationId
        : sheet.match.competition.organizationId;

    const log = await this.prisma.auditLog.create({
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
          sheetFingerprint,
        },
      },
    });
    return { id: log.id, ...(log.metadata as SignatureMetadata) };
  }

  private loadSheet(matchId: string) {
    return this.prisma.matchSheet.findUnique({
      where: { matchId },
      include: {
        players: { orderBy: [{ side: 'asc' }, { shirtNumber: 'asc' }] },
        match: { include: { homeClub: true, awayClub: true, competition: true } },
      },
    }).then((sheet) => {
      if (!sheet) throw new NotFoundException('Feuille de match introuvable');
      return sheet;
    });
  }

  private async assertCanRead(actor: AuthenticatedActor, homeOrgId: string, awayOrgId: string) {
    const allowed = actor.memberships.some((m) => m.role === Role.LIGUE_ADMIN || m.role === Role.OFFICIEL || (m.role === Role.CLUB_ADMIN && [homeOrgId, awayOrgId].includes(m.organizationId)));
    if (!allowed) throw new ForbiddenException('Accès interdit aux signatures de cette feuille');
  }

  private async assertCanSign(actor: AuthenticatedActor, matchId: string, role: MatchSheetSignatureRole, homeOrgId: string, awayOrgId: string) {
    if (role === MatchSheetSignatureRole.HOME_REPRESENTATIVE || role === MatchSheetSignatureRole.AWAY_REPRESENTATIVE) {
      const target = role === MatchSheetSignatureRole.HOME_REPRESENTATIVE ? homeOrgId : awayOrgId;
      if (!actor.memberships.some((m) => m.role === Role.CLUB_ADMIN && m.organizationId === target)) throw new ForbiddenException('Seul le représentant du club concerné peut signer');
      return;
    }
    if (actor.memberships.some((m) => m.role === Role.LIGUE_ADMIN)) return;
    if (!actor.memberships.some((m) => m.role === Role.OFFICIEL)) throw new ForbiddenException('Seul un officiel confirmé peut signer');
    const profile = await this.prisma.officialProfile.findUnique({ where: { userId: actor.userId } });
    if (!profile) throw new ForbiddenException('Profil officiel introuvable');
    const assignment = await this.prisma.matchOfficialAssignment.findFirst({ where: { matchId, officialProfileId: profile.registrationId, status: MatchOfficialAssignmentStatus.ACCEPTED } });
    if (!assignment) throw new ForbiddenException('Cet officiel n’est pas confirmé sur cette rencontre');
  }
}
