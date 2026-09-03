import { Injectable } from '@nestjs/common';
import { RegistrationCategory, RegistrationStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedActor } from '../iam/domain/actor';
import { TenantAccessService } from '../iam/tenant-access.service';

@Injectable()
export class PlayerResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async resolve(actor: AuthenticatedActor, organizationId: string, spokenOrTypedName: string) {
    this.tenantAccess.assertOrganizationAccess(actor, organizationId);
    const query = spokenOrTypedName.trim();
    if (!query) return { query, match: null, alternatives: [], ambiguous: false };

    const registrations = await this.prisma.registration.findMany({
      where: {
        organizationId,
        category: RegistrationCategory.PLAYER,
        status: { not: RegistrationStatus.ARCHIVED },
      },
      include: {
        person: true,
        playerProfile: true,
        licenses: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      take: 200,
    });

    const ranked = registrations
      .map((registration) => {
        const fullName = `${registration.person.firstName} ${registration.person.lastName}`.trim();
        return {
          registrationId: registration.id,
          fullName,
          firstName: registration.person.firstName,
          lastName: registration.person.lastName,
          birthDate: registration.person.birthDate,
          nationality: registration.person.nationality,
          position: registration.playerProfile?.position ?? null,
          shirtNumber: registration.playerProfile?.shirtNumber ?? null,
          license: registration.licenses[0] ?? null,
          score: this.similarity(query, fullName),
        };
      })
      .filter((candidate) => candidate.score >= 0.45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const best = ranked[0] ?? null;
    const second = ranked[1] ?? null;
    const ambiguous = Boolean(best && second && best.score - second.score < 0.08);

    return {
      query,
      match: best && !ambiguous && best.score >= 0.62 ? best : null,
      alternatives: ranked,
      ambiguous,
    };
  }

  private normalize(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(ouvre|ouvrir|affiche|afficher|fiche|joueur|de|du|la|le|les|stp|svp)\b/g, ' ')
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
    const editScore = 1 - this.levenshtein(a.replace(/\s/g, ''), b.replace(/\s/g, '')) / Math.max(a.replace(/\s/g, '').length, b.replace(/\s/g, '').length);
    return Math.max(tokenScore, editScore, tokenScore * 0.7 + editScore * 0.3);
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
}
