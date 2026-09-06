import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LicenseStatus, RegistrationCategory, RegistrationStatus, Role } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';

@Injectable()
export class MatchSheetsService {
  constructor(private readonly prisma: PrismaService) {}

  async eligiblePlayers(actor: AuthenticatedActor, matchId: string, clubId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        competition: { include: { season: true } },
        homeClub: { include: { organization: true } },
        awayClub: { include: { organization: true } },
      },
    });

    if (!match) {
      throw new NotFoundException('Rencontre introuvable');
    }

    const club =
      match.homeClubId === clubId
        ? match.homeClub
        : match.awayClubId === clubId
          ? match.awayClub
          : null;

    if (!club) {
      throw new ForbiddenException("Le club ne participe pas à cette rencontre");
    }

    const isLeagueOrOfficial = actor.memberships.some((membership) =>
      [Role.LIGUE_ADMIN, Role.OFFICIEL].includes(membership.role),
    );
    const isClubAdminForOrganization = actor.memberships.some(
      (membership) =>
        membership.role === Role.CLUB_ADMIN &&
        membership.organizationId === club.organizationId,
    );

    if (!isLeagueOrOfficial && !isClubAdminForOrganization) {
      throw new ForbiddenException("Accès interdit à la feuille de match de ce club");
    }

    const registrations = await this.prisma.registration.findMany({
      where: {
        organizationId: club.organizationId,
        category: RegistrationCategory.PLAYER,
      },
      include: {
        person: true,
        playerProfile: true,
        licenses: {
          where: { season: match.competition.season.name },
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
    });

    const matchDate = match.kickoffAt;

    return {
      match: {
        id: match.id,
        kickoffAt: match.kickoffAt,
        season: match.competition.season.name,
        homeClubId: match.homeClubId,
        awayClubId: match.awayClubId,
      },
      club: {
        id: club.id,
        organizationId: club.organizationId,
        name: club.organization.name,
      },
      players: registrations.map((registration) => {
        const license = registration.licenses[0] ?? null;
        const reasons: string[] = [];

        if (
          registration.status === RegistrationStatus.SUSPENDED ||
          registration.status === RegistrationStatus.ARCHIVED
        ) {
          reasons.push('Inscription joueur suspendue ou archivée');
        }

        if (!license) {
          reasons.push('Aucune licence pour la saison de la rencontre');
        } else if (license.status !== LicenseStatus.ISSUED_BY_FBF) {
          reasons.push(`Licence non délivrée par la FBF (${license.status})`);
        }

        if (!matchDate) {
          reasons.push('Date de coup d’envoi non définie');
        }

        if (license && matchDate) {
          if (!license.validFrom || !license.validUntil) {
            reasons.push('Période de validité de la licence incomplète');
          } else {
            if (matchDate < license.validFrom) {
              reasons.push('Licence non encore valide à la date du match');
            }
            if (matchDate > license.validUntil) {
              reasons.push('Licence expirée à la date du match');
            }
          }
        }

        return {
          registrationId: registration.id,
          player: {
            firstName: registration.person.firstName,
            lastName: registration.person.lastName,
            federationId: registration.person.federationId,
            position: registration.playerProfile?.position ?? null,
            shirtNumber: registration.playerProfile?.shirtNumber ?? null,
          },
          license: license
            ? {
                id: license.id,
                number: license.number,
                status: license.status,
                validFrom: license.validFrom,
                validUntil: license.validUntil,
              }
            : null,
          eligible: reasons.length === 0,
          reasons,
        };
      }),
    };
  }
}
