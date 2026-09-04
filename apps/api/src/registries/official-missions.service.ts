import { ForbiddenException, Injectable } from '@nestjs/common';
import { MatchOfficialAssignmentStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';

@Injectable()
export class OfficialMissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedActor) {
    const official = await this.prisma.officialProfile.findUnique({
      where: { userId: actor.userId },
      select: { registrationId: true },
    });

    if (!official) {
      throw new ForbiddenException(
        'Aucun profil officiel n’est lié à ce compte utilisateur',
      );
    }

    const assignments = await this.prisma.matchOfficialAssignment.findMany({
      where: {
        officialProfileId: official.registrationId,
        status: MatchOfficialAssignmentStatus.ACCEPTED,
      },
      include: {
        match: {
          include: {
            homeClub: true,
            awayClub: true,
            venue: true,
            round: true,
            competition: { include: { season: true } },
          },
        },
      },
      orderBy: { match: { kickoffAt: 'asc' } },
    });

    return assignments.map((assignment) => ({
      assignmentId: assignment.id,
      role: assignment.role,
      status: assignment.status,
      match: {
        id: assignment.match.id,
        kickoffAt: assignment.match.kickoffAt,
        status: assignment.match.status,
        round: assignment.match.round?.number ?? null,
        venue: assignment.match.venue?.name ?? null,
        competition: assignment.match.competition.name,
        season: assignment.match.competition.season.name,
        homeClub: {
          id: assignment.match.homeClub.id,
          name: assignment.match.homeClub.shortName,
        },
        awayClub: {
          id: assignment.match.awayClub.id,
          name: assignment.match.awayClub.shortName,
        },
      },
    }));
  }
}
