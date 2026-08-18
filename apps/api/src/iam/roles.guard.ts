import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ActorRequest } from '../auth/jwt-auth.guard';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const actor = context.switchToHttp().getRequest<ActorRequest>().actor;
    const allowed = actor?.memberships.some((membership) => required.includes(membership.role));

    if (!allowed) throw new ForbiddenException('Rôle insuffisant pour cette opération');
    return true;
  }
}
