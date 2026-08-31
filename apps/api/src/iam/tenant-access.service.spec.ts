import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { TenantAccessService } from './tenant-access.service';

describe('TenantAccessService', () => {
  const service = new TenantAccessService();
  const dragonsId = '11111111-1111-1111-1111-111111111111';
  const azizaId = '22222222-2222-2222-2222-222222222222';

  it('autorise un administrateur de club à lire son organisation', () => {
    const actor = {
      userId: 'user-1',
      memberships: [{ organizationId: dragonsId, role: Role.CLUB_ADMIN }],
    };

    expect(service.canAccessOrganization(actor, dragonsId)).toBe(true);
  });

  it('interdit à un club de lire les données d’un autre club', () => {
    const actor = {
      userId: 'user-1',
      memberships: [{ organizationId: dragonsId, role: Role.CLUB_ADMIN }],
    };

    expect(() => service.assertOrganizationAccess(actor, azizaId)).toThrow(ForbiddenException);
  });

  it('autorise la Ligue à superviser toutes les organisations', () => {
    const actor = {
      userId: 'user-ligue',
      memberships: [{ organizationId: 'league-id', role: Role.LIGUE_ADMIN }],
    };

    expect(service.canAccessOrganization(actor, azizaId)).toBe(true);
    expect(service.organizationScope(actor)).toBeNull();
  });

  it('autorise un agent FBF à consulter les dossiers transmis par tous les clubs', () => {
    const actor = {
      userId: 'federation-user',
      memberships: [{ organizationId: 'federation-id', role: Role.FEDERATION_AGENT }],
    };
    expect(service.canAccessOrganization(actor, 'club-id')).toBe(true);
    expect(service.organizationScope(actor)).toBeNull();
  });

  it.each([Role.COMPETITION_MANAGER, Role.SCHEDULE_APPROVER])(
    'autorise le rôle Ligue %s à accéder aux compétitions',
    (role) => {
      const actor = {
        userId: 'league-user',
        memberships: [{ organizationId: 'league-id', role }],
      };

      expect(service.canAccessOrganization(actor, azizaId)).toBe(true);
      expect(service.organizationScope(actor)).toBeNull();
    },
  );

  it('retourne une portée limitée pour un officiel ou un club', () => {
    const actor = {
      userId: 'official-1',
      memberships: [{ organizationId: dragonsId, role: Role.OFFICIEL }],
    };

    expect(service.organizationScope(actor)).toEqual([dragonsId]);
  });
});
