import { Controller, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentActor } from '../iam/current-actor.decorator';
import { AuthenticatedActor } from '../iam/domain/actor';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { StaffLifecycleService } from './staff-lifecycle.service';

@Controller('registries/staff')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffLifecycleController {
  constructor(private readonly staffLifecycle: StaffLifecycleService) {}

  @Patch(':registrationId/archive')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  archiveStaff(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
  ) {
    return this.staffLifecycle.archiveStaff(actor, registrationId);
  }
}
