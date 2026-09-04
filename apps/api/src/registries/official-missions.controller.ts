import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentActor } from '../iam/current-actor.decorator';
import { AuthenticatedActor } from '../iam/domain/actor';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { OfficialMissionsService } from './official-missions.service';

@Controller('official-missions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OFFICIEL)
export class OfficialMissionsController {
  constructor(private readonly service: OfficialMissionsService) {}

  @Get()
  list(@CurrentActor() actor: AuthenticatedActor) {
    return this.service.list(actor);
  }
}
