import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  LicenseStatus,
  MatchOfficialAssignmentStatus,
  RegistrationCategory,
  RegistrationStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';

@Injectable()
export class OfficialMatchPlayerAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async listMatchPlayers(actor: AuthenticatedActor, matchId: string) {
    const context = await this.getAuthorizedMatchContext(actor, matchId);
    const organizationIds = [
      context.homeClub.organizationId,
      context.awayClub.organizationId,
    ];

    const registrations = await this.prisma.registration.findMany({
      where: {
        organizationId: { in: organizationIds },
        category: RegistrationCategory.PLAYER,
        status: { not: RegistrationStatus.ARCHIVED },
      },
      include: {
        person: true,
        playerProfile: true,
        organization: { include: { club: true } },
        licenses: {
          where: { season: context.competition.season.name },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ organizationId: 'asc' }, { person: { lastName: 'asc' } }],
    });

    return {
      match: {
        id: context.id,
        kickoffAt: context.kickoffAt,
        status: context.status,
        season: context.competition.season.name,
        competition: context.competition.name,
        homeClub: {
          id: context.homeClub.id,
          name: context.homeClub.shortName,
        },
        awayClub: {
          id: context.awayClub.id,
          name: context.awayClub.shortName,
        },
      },
      players: registrations.map((registration) =>
        this.toOfficialPlayerView(registration),
      ),
    };
  }

  async resolveMatchPlayer(
    actor: AuthenticatedActor,
    matchId: string,
    rawQuery: string,
  ) {
    const payload = await this.listMatchPlayers(actor, matchId);
    const query = rawQuery.trim();
    if (!query) {
      return { ...payload, query, match: null, alternatives: [], ambiguous: false };
    }

    const ranked = payload.players
      .map((player) => ({
        ...player,
        score: this.similarity(query, player.fullName),
      }))
      .filter((player) => player.score >= 0.45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const best = ranked[0] ?? null;
    const second = ranked[1] ?? null;
    const ambiguous = Boolean(best && second && best.score - second.score < 0.08);

    return {
      matchContext: payload.match,
      query,
      match: best && !ambiguous && best.score >= 0.62 ? best : null,
      alternatives: ranked,
      ambiguous,
    };
  }

  private async getAuthorizedMatchContext(
    actor: AuthenticatedActor,
    matchId: string,
  ) {
    const official = await this.prisma.officialProfile.findUnique({
      where: { userId: actor.userId },
      select: { registrationId: true },
    });

    if (!official) {
      throw new ForbiddenException(
        'Aucun profil officiel n’est lié à ce compte utilisateur',
      );
    }

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        competition: { include: { season: true } },
        homeClub: true,
        awayClub: true,
        officialAssignments: {
          where: {
            officialProfileId: official.registrationId,
            status: MatchOfficialAssignmentStatus.ACCEPTED,
          },
          select: { id: true, role: true, status: true },
        },
      },
    });

    if (!match) throw new NotFoundException('Rencontre introuvable');
    if (match.officialAssignments.length === 0) {
      throw new ForbiddenException(
        'Accès refusé : cette rencontre n’est pas une mission acceptée par cet officiel',
      );
    }

    return match;
  }

  private toOfficialPlayerView(registration: any) {
    const license = registration.licenses[0] ?? null;
    const photoDataUrl =
      registration.person.photoData && registration.person.photoMimeType
        ? `data:${registration.person.photoMimeType};base64,${Buffer.from(
            registration.person.photoData,
          ).toString('base64')}`
        : null;

    return {
      registrationId: registration.id,
      club: {
        organizationId: registration.organizationId,
        name:
          registration.organization.club?.shortName ??
          registration.organization.name,
      },
      fullName: `${registration.person.firstName} ${registration.person.lastName}`.trim(),
      firstName: registration.person.firstName,
      lastName: registration.person.lastName,
      birthDate: registration.person.birthDate,
      federationId: registration.person.federationId,
      photoDataUrl,
      position: registration.playerProfile?.position ?? null,
      shirtNumber: registration.playerProfile?.shirtNumber ?? null,
      registrationStatus: registration.status,
      license: license
        ? {
            number: license.number,
            season: license.season,
            status: license.status,
          }
        : null,
      eligibility:
        registration.status === RegistrationStatus.VALIDATED &&
        license?.status === LicenseStatus.ISSUED_BY_FBF
          ? 'ELIGIBLE'
          : 'CHECK_REQUIRED',
    };
  }

  private normalize(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(
        /\b(ouvre|ouvrir|affiche|afficher|fiche|joueur|de|du|la|le|les|stp|svp|controle|verifie)\b/g,
        ' ',
      )
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private similarity(left: string, right: string) {
    const a = this.normalize(left);
    const b = this.normalize(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (b.includes(a) || a.includes(b)) return 0.94;

    const aTokens = new Set(a.split(/\s+/));
    const bTokens = new Set(b.split(/\s+/));
    const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
    const tokenScore = overlap / Math.max(aTokens.size, bTokens.size);
    const compactA = a.replace(/\s/g, '');
    const compactB = b.replace(/\s/g, '');
    const editScore =
      1 -
      this.levenshtein(compactA, compactB) /
        Math.max(compactA.length, compactB.length);
    return Math.max(tokenScore, editScore, tokenScore * 0.7 + editScore * 0.3);
  }

  private levenshtein(a: string, b: string) {
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const old = row[j];
        row[j] = Math.min(
          row[j] + 1,
          row[j - 1] + 1,
          previous + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
        previous = old;
      }
    }
    return row[b.length];
  }
}
