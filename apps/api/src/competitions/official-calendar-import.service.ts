import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantAccessService } from '../iam/tenant-access.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import {
  OfficialCalendarRowDto,
  PreviewOfficialCalendarDto,
} from './dto/preview-official-calendar.dto';

type Candidate = {
  id: string;
  label: string;
};

@Injectable()
export class OfficialCalendarImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async preview(
    actor: AuthenticatedActor,
    competitionId: string,
    input: PreviewOfficialCalendarDto,
  ) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        season: true,
        entries: {
          where: { active: true },
          include: {
            club: {
              include: { organization: true },
            },
          },
        },
      },
    });

    if (!competition) {
      throw new NotFoundException('Compétition introuvable');
    }

    this.tenantAccess.assertOrganizationAccess(
      actor,
      competition.organizationId,
    );

    const venues = await this.prisma.venue.findMany({
      where: { active: true },
      orderBy: [{ name: 'asc' }, { city: 'asc' }],
    });

    const clubs: Candidate[] = competition.entries.map((entry) => ({
      id: entry.club.id,
      label: entry.club.organization.name || entry.club.shortName,
    }));

    const clubAliases = competition.entries.flatMap((entry) => [
      {
        id: entry.club.id,
        label: entry.club.organization.name,
      },
      {
        id: entry.club.id,
        label: entry.club.shortName,
      },
    ]);

    const venueCandidates: Candidate[] = venues.map((venue) => ({
      id: venue.id,
      label: venue.name,
    }));

    const seenMatchNumbers = new Set<string>();
    const seenFixtures = new Set<string>();

    const rows = input.rows.map((row, index) => {
      const home = this.resolve(row.homeClub, clubAliases);
      const away = this.resolve(row.awayClub, clubAliases);
      const venue = row.venue
        ? this.resolve(row.venue, venueCandidates)
        : null;

      const issues: string[] = [];

      if (!home) {
        issues.push(`Club domicile non reconnu : ${row.homeClub}`);
      }

      if (!away) {
        issues.push(`Club extérieur non reconnu : ${row.awayClub}`);
      }

      if (home && away && home.id === away.id) {
        issues.push('Le club domicile et le club extérieur sont identiques');
      }

      if (!row.matchNumber?.trim()) {
        issues.push('Numéro officiel du match absent');
      }

      if (!row.date?.trim()) {
        issues.push('Date absente');
      }

      if (!row.time?.trim()) {
        issues.push('Heure absente');
      }

      if (!row.venue?.trim()) {
        issues.push('Stade absent');
      } else if (!venue) {
        issues.push(`Stade non reconnu : ${row.venue}`);
      }

      const kickoffAt = this.parseKickoff(row);
      if (row.date && row.time && !kickoffAt) {
        issues.push(`Date/heure non reconnue : ${row.date} ${row.time}`);
      }

      if (kickoffAt) {
        const kickoffDate = new Date(kickoffAt);
        const seasonStart = new Date(competition.season.startDate);
        const seasonEnd = new Date(competition.season.endDate);

        if (kickoffDate < seasonStart || kickoffDate > seasonEnd) {
          issues.push(
            `Date hors saison ${competition.season.name} : ${row.date}`,
          );
        }
      }

      const normalizedMatchNumber = this.normalize(row.matchNumber);

      if (normalizedMatchNumber) {
        if (seenMatchNumbers.has(normalizedMatchNumber)) {
          issues.push(
            `Numéro officiel dupliqué dans le document : ${row.matchNumber}`,
          );
        }

        seenMatchNumbers.add(normalizedMatchNumber);
      }

      if (home && away) {
        const fixtureKey = [
          row.roundNumber,
          home.id,
          away.id,
        ].join(':');

        if (seenFixtures.has(fixtureKey)) {
          issues.push(
            `Rencontre dupliquée pour la journée ${row.roundNumber} : ` +
              `${row.homeClub} - ${row.awayClub}`,
          );
        }

        seenFixtures.add(fixtureKey);
      }

      return {
        rowNumber: index + 1,
        source: row,
        resolved: {
          homeClub: home,
          awayClub: away,
          venue,
          kickoffAt,
        },
        valid: issues.length === 0,
        issues,
      };
    });

    const unresolvedClubs = Array.from(
      new Set(
        rows.flatMap((row) =>
          row.issues
            .filter((issue) => issue.startsWith('Club '))
            .map((issue) => issue.split(': ').slice(1).join(': ')),
        ),
      ),
    );

    const unresolvedVenues = Array.from(
      new Set(
        rows.flatMap((row) =>
          row.issues
            .filter((issue) => issue.startsWith('Stade non reconnu'))
            .map((issue) => issue.split(': ').slice(1).join(': ')),
        ),
      ),
    );

    return {
      sourceName: input.sourceName,
      competition: {
        id: competition.id,
        name: competition.name,
        code: competition.code,
        season: competition.season.name,
      },
      summary: {
        rows: rows.length,
        validRows: rows.filter((row) => row.valid).length,
        invalidRows: rows.filter((row) => !row.valid).length,
        clubsAvailable: clubs.length,
        unresolvedClubs,
        unresolvedVenues,
      },
      rows,
    };
  }


  async importCalendar(
    actor: AuthenticatedActor,
    competitionId: string,
    input: PreviewOfficialCalendarDto,
  ) {
    const preview = await this.preview(actor, competitionId, input);

    if (preview.summary.invalidRows > 0) {
      throw new BadRequestException({
        message: 'Le calendrier contient des anomalies. Import annulé.',
        summary: preview.summary,
      });
    }

    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
      include: { season: true },
    });

    if (!competition) {
      throw new NotFoundException('Compétition introuvable');
    }

    this.tenantAccess.assertOrganizationAccess(
      actor,
      competition.organizationId,
    );

    return this.prisma.$transaction(async (tx) => {
      let roundsCreated = 0;
      let roundsUpdated = 0;
      let matchesCreated = 0;
      let matchesUpdated = 0;
      let matchesUnchanged = 0;

      const roundNumbers = Array.from(
        new Set(preview.rows.map((row) => row.source.roundNumber)),
      ).sort((a, b) => a - b);

      const rounds = new Map<number, string>();

      for (const number of roundNumbers) {
        const sourceRows = preview.rows.filter(
          (row) => row.source.roundNumber === number,
        );

        const datedRows = sourceRows
          .map((row) => row.source.date)
          .filter((value): value is string => Boolean(value))
          .map((value) => this.parseDateOnly(value))
          .filter((value): value is Date => value !== null)
          .sort((a, b) => a.getTime() - b.getTime());

        const startDate = datedRows[0] ?? null;
        const endDate = datedRows[datedRows.length - 1] ?? null;

        const existingRound = await tx.competitionRound.findUnique({
          where: {
            competitionId_number: {
              competitionId,
              number,
            },
          },
        });

        if (existingRound) {
          const updated = await tx.competitionRound.update({
            where: { id: existingRound.id },
            data: {
              name: existingRound.name ?? `Journée ${number}`,
              startDate,
              endDate,
            },
          });

          rounds.set(number, updated.id);
          roundsUpdated += 1;
        } else {
          const created = await tx.competitionRound.create({
            data: {
              competitionId,
              number,
              name: `Journée ${number}`,
              startDate,
              endDate,
            },
          });

          rounds.set(number, created.id);
          roundsCreated += 1;
        }
      }

      for (const row of preview.rows) {
        const homeClubId = row.resolved.homeClub!.id;
        const awayClubId = row.resolved.awayClub!.id;
        const roundId = rounds.get(row.source.roundNumber)!;
        const venueId = row.resolved.venue?.id ?? null;
        const kickoffAt = row.resolved.kickoffAt
          ? new Date(row.resolved.kickoffAt)
          : null;

        const officialMatchNumber = row.source.matchNumber.trim();

        const existing = await tx.match.findUnique({
          where: {
            competitionId_officialMatchNumber: {
              competitionId,
              officialMatchNumber,
            },
          },
        });

        if (!existing) {
          await tx.match.create({
            data: {
              competitionId,
              roundId,
              venueId,
              officialMatchNumber,
              homeClubId,
              awayClubId,
              kickoffAt,
              status: kickoffAt ? 'SCHEDULED' : 'DRAFT',
            },
          });

          matchesCreated += 1;
          continue;
        }

        const identityChanged =
          existing.roundId !== roundId ||
          existing.homeClubId !== homeClubId ||
          existing.awayClubId !== awayClubId;

        if (identityChanged) {
          throw new BadRequestException(
            `Le numéro officiel ${officialMatchNumber} existe déjà mais ` +
              `ne correspond pas à la même journée ou aux mêmes clubs. ` +
              `Import annulé pour éviter de modifier l'identité du match.`,
          );
        }

        const existingKickoff = existing.kickoffAt?.getTime() ?? null;
        const importedKickoff = kickoffAt?.getTime() ?? null;

        const changed =
          existing.venueId !== venueId ||
          existingKickoff !== importedKickoff;

        if (!changed) {
          matchesUnchanged += 1;
          continue;
        }

        if (
          existing.status === 'IN_PROGRESS' ||
          existing.status === 'COMPLETED' ||
          existing.homologationStatus !== null
        ) {
          throw new BadRequestException(
            `Le match ${row.source.homeClub} - ${row.source.awayClub} ` +
              `ne peut pas être modifié automatiquement : ` +
              `il est déjà en cours, terminé ou homologué.`,
          );
        }

        await tx.match.update({
          where: { id: existing.id },
          data: {
            venueId,
            kickoffAt,
            status: kickoffAt ? 'SCHEDULED' : existing.status,
          },
        });

        matchesUpdated += 1;
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: competition.organizationId,
          action: 'OFFICIAL_CALENDAR_IMPORTED',
          resourceType: 'Competition',
          resourceId: competitionId,
          metadata: {
            sourceName: input.sourceName,
            season: competition.season.name,
            competition: competition.name,
            rows: preview.summary.rows,
            roundsCreated,
            roundsUpdated,
            matchesCreated,
            matchesUpdated,
            matchesUnchanged,
          },
        },
      });

      return {
        sourceName: input.sourceName,
        competition: {
          id: competition.id,
          name: competition.name,
          season: competition.season.name,
        },
        roundsCreated,
        roundsUpdated,
        matchesCreated,
        matchesUpdated,
        matchesUnchanged,
        totalMatches: preview.summary.rows,
      };
    });
  }

  private parseDateOnly(value: string): Date | null {
    const date = value.trim();

    const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const french = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

    let year: string;
    let month: string;
    let day: string;

    if (iso) {
      [, year, month, day] = iso;
    } else if (french) {
      [, day, month, year] = french;
      day = day.padStart(2, '0');
      month = month.padStart(2, '0');
    } else {
      return null;
    }

    const parsed = new Date(`${year}-${month}-${day}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private resolve(value: string, candidates: Candidate[]): Candidate | null {
    const wanted = this.normalize(value);
    if (!wanted) return null;

    const exact = candidates.find(
      (candidate) => this.normalize(candidate.label) === wanted,
    );
    if (exact) return exact;

    const partial = candidates.filter((candidate) => {
      const label = this.normalize(candidate.label);
      return label.includes(wanted) || wanted.includes(label);
    });

    const uniqueIds = Array.from(new Set(partial.map((candidate) => candidate.id)));
    if (uniqueIds.length !== 1) return null;

    return partial[0] ?? null;
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private parseKickoff(row: OfficialCalendarRowDto): string | null {
    if (!row.date?.trim() || !row.time?.trim()) return null;

    const date = row.date.trim();
    const rawTime = row.time.trim().toUpperCase().replace(/\s+/g, '');

    let year: string;
    let month: string;
    let day: string;

    const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const french = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

    if (iso) {
      [, year, month, day] = iso;
    } else if (french) {
      [, day, month, year] = french;
      day = day.padStart(2, '0');
      month = month.padStart(2, '0');
    } else {
      return null;
    }

    const yearNumber = Number(year);
    const monthNumber = Number(month);
    const dayNumber = Number(day);

    const dateCheck = new Date(
      Date.UTC(yearNumber, monthNumber - 1, dayNumber),
    );

    if (
      dateCheck.getUTCFullYear() !== yearNumber ||
      dateCheck.getUTCMonth() + 1 !== monthNumber ||
      dateCheck.getUTCDate() !== dayNumber
    ) {
      return null;
    }

    const timeMatch = rawTime.match(/^(\d{1,2})(?:H|:)(\d{2})?$/);
    if (!timeMatch) return null;

    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] ?? '00');

    if (hour > 23 || minute > 59) {
      return null;
    }

    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');

    return `${year}-${month}-${day}T${hh}:${mm}:00+01:00`;
  }
}
