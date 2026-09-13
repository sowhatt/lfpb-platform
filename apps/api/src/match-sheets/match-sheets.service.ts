import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LicenseStatus,
  MatchEligibilityStatus,
  MatchOfficialAssignmentStatus,
  MatchSheetSide,
  MatchSheetStatus,
  RegistrationCategory,
  RegistrationStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import { AddMatchSheetPlayerDto } from './dto/add-match-sheet-player.dto';

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
      throw new ForbiddenException('Le club ne participe pas à cette rencontre');
    }

    const isLeagueOrOfficial = actor.memberships.some(
      (membership) =>
        membership.role === Role.LIGUE_ADMIN || membership.role === Role.OFFICIEL,
    );
    const isClubAdminForOrganization = actor.memberships.some(
      (membership) =>
        membership.role === Role.CLUB_ADMIN &&
        membership.organizationId === club.organizationId,
    );

    if (!isLeagueOrOfficial && !isClubAdminForOrganization) {
      throw new ForbiddenException('Accès interdit à la feuille de match de ce club');
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

  async getSheet(actor: AuthenticatedActor, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeClub: true,
        awayClub: true,
      },
    });

    if (!match) {
      throw new NotFoundException('Rencontre introuvable');
    }

    const hasLeagueOrOfficialAccess = actor.memberships.some(
      (membership) =>
        membership.role === Role.LIGUE_ADMIN || membership.role === Role.OFFICIEL,
    );
    const participatingOrganizationIds = [
      match.homeClub.organizationId,
      match.awayClub.organizationId,
    ];
    const hasClubAccess = actor.memberships.some(
      (membership) =>
        membership.role === Role.CLUB_ADMIN &&
        participatingOrganizationIds.includes(membership.organizationId),
    );

    if (!hasLeagueOrOfficialAccess && !hasClubAccess) {
      throw new ForbiddenException('Accès interdit à cette feuille de match');
    }

    return this.prisma.matchSheet.findUnique({
      where: { matchId },
      include: {
        players: {
          include: {
            registration: {
              include: { person: true, playerProfile: true },
            },
            club: { include: { organization: true } },
          },
          orderBy: [{ side: 'asc' }, { role: 'asc' }, { shirtNumber: 'asc' }],
        },
      },
    });
  }

  async addPlayer(
    actor: AuthenticatedActor,
    matchId: string,
    input: AddMatchSheetPlayerDto,
  ) {
    const eligibility = await this.eligiblePlayers(actor, matchId, input.clubId);
    const player = eligibility.players.find(
      (candidate) => candidate.registrationId === input.registrationId,
    );

    if (!player) {
      throw new BadRequestException("Le joueur n'appartient pas à ce club pour cette rencontre");
    }

    if (!player.eligible) {
      throw new BadRequestException(
        `Joueur non éligible : ${player.reasons.join(' ; ')}`,
      );
    }

    const side =
      eligibility.match.homeClubId === input.clubId
        ? MatchSheetSide.HOME
        : MatchSheetSide.AWAY;

    const existingSheet = await this.prisma.matchSheet.findUnique({
      where: { matchId },
    });

    if (existingSheet) {
      if (existingSheet.status === MatchSheetStatus.LOCKED) {
        throw new BadRequestException('La feuille de match est verrouillée');
      }

      const sideAlreadySubmitted =
        side === MatchSheetSide.HOME
          ? Boolean(existingSheet.homeSubmittedAt)
          : Boolean(existingSheet.awaySubmittedAt);

      if (sideAlreadySubmitted) {
        throw new BadRequestException(
          `La composition ${side === MatchSheetSide.HOME ? 'domicile' : 'extérieur'} a déjà été soumise`,
        );
      }
    }

    const sheet = await this.prisma.matchSheet.upsert({
      where: { matchId },
      update: {},
      create: { matchId },
    });

    const savedPlayer = await this.prisma.matchSheetPlayer.upsert({
      where: {
        matchSheetId_registrationId: {
          matchSheetId: sheet.id,
          registrationId: input.registrationId,
        },
      },
      update: {
        clubId: input.clubId,
        side,
        role: input.role,
        shirtNumber: input.shirtNumber,
        eligibilityStatus: MatchEligibilityStatus.ELIGIBLE,
        eligibilityReason: null,
      },
      create: {
        matchSheetId: sheet.id,
        registrationId: input.registrationId,
        clubId: input.clubId,
        side,
        role: input.role,
        shirtNumber: input.shirtNumber,
        eligibilityStatus: MatchEligibilityStatus.ELIGIBLE,
      },
      include: {
        registration: { include: { person: true, playerProfile: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        organizationId: eligibility.club.organizationId,
        action: 'MATCH_SHEET_PLAYER_SAVED',
        resourceType: 'MatchSheet',
        resourceId: sheet.id,
        metadata: {
          matchId,
          clubId: input.clubId,
          registrationId: input.registrationId,
          side,
          role: input.role,
          shirtNumber: input.shirtNumber,
        },
      },
    });

    return savedPlayer;
  }

  async submitSide(actor: AuthenticatedActor, matchId: string, clubId: string) {
    const eligibility = await this.eligiblePlayers(actor, matchId, clubId);
    const side =
      eligibility.match.homeClubId === clubId
        ? MatchSheetSide.HOME
        : MatchSheetSide.AWAY;

    const sheet = await this.prisma.matchSheet.findUnique({
      where: { matchId },
      include: {
        players: {
          where: { clubId, side },
          select: { id: true },
        },
      },
    });

    if (!sheet) {
      throw new BadRequestException('Aucune feuille de match à soumettre');
    }

    if (sheet.status === MatchSheetStatus.LOCKED) {
      throw new BadRequestException('La feuille de match est verrouillée');
    }

    const alreadySubmitted =
      side === MatchSheetSide.HOME
        ? Boolean(sheet.homeSubmittedAt)
        : Boolean(sheet.awaySubmittedAt);

    if (alreadySubmitted) {
      throw new BadRequestException(
        `La composition ${side === MatchSheetSide.HOME ? 'domicile' : 'extérieur'} a déjà été soumise`,
      );
    }

    if (sheet.players.length === 0) {
      throw new BadRequestException('La composition doit contenir au moins un joueur');
    }

    const submittedAt = new Date();
    const homeSubmittedAt =
      side === MatchSheetSide.HOME ? submittedAt : sheet.homeSubmittedAt;
    const awaySubmittedAt =
      side === MatchSheetSide.AWAY ? submittedAt : sheet.awaySubmittedAt;
    const status =
      homeSubmittedAt && awaySubmittedAt
        ? MatchSheetStatus.SUBMITTED
        : MatchSheetStatus.DRAFT;

    const updated = await this.prisma.matchSheet.update({
      where: { id: sheet.id },
      data: {
        homeSubmittedAt,
        awaySubmittedAt,
        status,
      },
      include: {
        players: {
          include: {
            registration: {
              include: { person: true, playerProfile: true },
            },
            club: { include: { organization: true } },
          },
          orderBy: [{ side: 'asc' }, { role: 'asc' }, { shirtNumber: 'asc' }],
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        organizationId: eligibility.club.organizationId,
        action: 'MATCH_SHEET_SIDE_SUBMITTED',
        resourceType: 'MatchSheet',
        resourceId: sheet.id,
        metadata: {
          matchId,
          clubId,
          side,
          submittedAt: submittedAt.toISOString(),
          status,
        },
      },
    });

    return updated;
  }

  async validateSheet(actor: AuthenticatedActor, matchId: string) {
    const validatedByRole = await this.assertCanControlSheet(actor, matchId);

    const sheet = await this.prisma.matchSheet.findUnique({
      where: { matchId },
      include: {
        players: { select: { id: true, side: true } },
        match: {
          include: {
            competition: { select: { organizationId: true } },
          },
        },
      },
    });

    if (!sheet) {
      throw new NotFoundException('Feuille de match introuvable');
    }

    if (sheet.status !== MatchSheetStatus.SUBMITTED) {
      throw new BadRequestException('La feuille de match doit être soumise par les deux clubs avant validation');
    }

    if (!sheet.homeSubmittedAt || !sheet.awaySubmittedAt) {
      throw new BadRequestException('Les deux compositions doivent être soumises avant validation');
    }

    const hasHomePlayers = sheet.players.some((player) => player.side === MatchSheetSide.HOME);
    const hasAwayPlayers = sheet.players.some((player) => player.side === MatchSheetSide.AWAY);

    if (!hasHomePlayers || !hasAwayPlayers) {
      throw new BadRequestException('Les deux compositions doivent contenir au moins un joueur');
    }

    const validatedAt = new Date();
    const updated = await this.prisma.matchSheet.update({
      where: { id: sheet.id },
      data: { validatedAt },
      include: {
        players: {
          include: {
            registration: {
              include: { person: true, playerProfile: true },
            },
            club: { include: { organization: true } },
          },
          orderBy: [{ side: 'asc' }, { role: 'asc' }, { shirtNumber: 'asc' }],
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        organizationId: sheet.match.competition.organizationId,
        action: 'MATCH_SHEET_VALIDATED',
        resourceType: 'MatchSheet',
        resourceId: sheet.id,
        metadata: {
          matchId,
          validatedAt: validatedAt.toISOString(),
          validatedByRole,
        },
      },
    });

    return updated;
  }

  async lockSheet(actor: AuthenticatedActor, matchId: string) {
    const lockedByRole = await this.assertCanControlSheet(actor, matchId);

    const sheet = await this.prisma.matchSheet.findUnique({
      where: { matchId },
      include: {
        match: {
          include: {
            competition: { select: { organizationId: true } },
          },
        },
      },
    });

    if (!sheet) {
      throw new NotFoundException('Feuille de match introuvable');
    }

    if (sheet.status === MatchSheetStatus.LOCKED) {
      throw new BadRequestException('La feuille de match est déjà verrouillée');
    }

    if (sheet.status !== MatchSheetStatus.SUBMITTED || !sheet.validatedAt) {
      throw new BadRequestException('La feuille de match doit être validée avant verrouillage');
    }

    const lockedAt = new Date();
    const updated = await this.prisma.matchSheet.update({
      where: { id: sheet.id },
      data: {
        status: MatchSheetStatus.LOCKED,
        lockedAt,
      },
      include: {
        players: {
          include: {
            registration: {
              include: { person: true, playerProfile: true },
            },
            club: { include: { organization: true } },
          },
          orderBy: [{ side: 'asc' }, { role: 'asc' }, { shirtNumber: 'asc' }],
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        organizationId: sheet.match.competition.organizationId,
        action: 'MATCH_SHEET_LOCKED',
        resourceType: 'MatchSheet',
        resourceId: sheet.id,
        metadata: {
          matchId,
          lockedAt: lockedAt.toISOString(),
          lockedByRole,
        },
      },
    });

    return updated;
  }

  private async assertCanControlSheet(actor: AuthenticatedActor, matchId: string) {
    const isLeagueAdmin = actor.memberships.some(
      (membership) => membership.role === Role.LIGUE_ADMIN,
    );
    const isOfficial = actor.memberships.some(
      (membership) => membership.role === Role.OFFICIEL,
    );

    if (!isLeagueAdmin && !isOfficial) {
      throw new ForbiddenException('Seuls la Ligue ou un officiel peuvent contrôler la feuille de match');
    }

    if (isOfficial && !isLeagueAdmin) {
      const officialProfile = await this.prisma.officialProfile.findUnique({
        where: { userId: actor.userId },
      });

      if (!officialProfile) {
        throw new ForbiddenException('Profil officiel introuvable');
      }

      const assignment = await this.prisma.matchOfficialAssignment.findFirst({
        where: {
          matchId,
          officialProfileId: officialProfile.registrationId,
          status: MatchOfficialAssignmentStatus.ACCEPTED,
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (!assignment) {
        throw new ForbiddenException('Cet officiel n’est pas affecté et confirmé sur cette rencontre');
      }
    }

    return isLeagueAdmin ? Role.LIGUE_ADMIN : Role.OFFICIEL;
  }
}
