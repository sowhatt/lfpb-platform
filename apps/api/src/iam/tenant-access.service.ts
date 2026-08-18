import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedActor } from './domain/actor';

const CROSS_TENANT_ROLES = new Set<Role>([Role.LIGUE_ADMIN, Role.SUPPORT]);

@Injectable()
export class TenantAccessService {
  canAccessOrganization(actor: AuthenticatedActor, targetOrganizationId: string): boolean {
    return actor.memberships.some(
      (membership) =>
        membership.organizationId === targetOrganizationId ||
        CROSS_TENANT_ROLES.has(membership.role),
    );
  }

  assertOrganizationAccess(actor: AuthenticatedActor, targetOrganizationId: string): void {
    if (!this.canAccessOrganization(actor, targetOrganizationId)) {
      throw new ForbiddenException('Accès interdit aux données de cette organisation');
    }
  }

  organizationScope(actor: AuthenticatedActor): string[] | null {
    if (actor.memberships.some((membership) => CROSS_TENANT_ROLES.has(membership.role))) {
      return null;
    }

    return [...new Set(actor.memberships.map((membership) => membership.organizationId))];
  }
}
