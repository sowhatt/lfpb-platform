import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentActor } from '../iam/current-actor.decorator';
import { AuthenticatedActor } from '../iam/domain/actor';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { CreateMatchEventDto } from './dto/create-match-event.dto';
import { MatchEventsService } from './match-events.service';

@Controller('matches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MatchEventsController {
  constructor(private readonly matchEvents: MatchEventsService) {}

  @Get(':matchId/events')
  @Roles(Role.LIGUE_ADMIN, Role.OFFICIEL)
  list(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.matchEvents.list(actor, matchId);
  }

  @Post(':matchId/events')
  @Roles(Role.LIGUE_ADMIN, Role.OFFICIEL)
  create(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() input: CreateMatchEventDto,
  ) {
    return this.matchEvents.create(actor, matchId, input);
  }
}
