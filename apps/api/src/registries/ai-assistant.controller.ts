import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentActor } from '../iam/current-actor.decorator';
import { AuthenticatedActor } from '../iam/domain/actor';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { PlayerResolverService } from './player-resolver.service';
import { RkjoAiAdapterService } from './rkjo-ai-adapter.service';

@Controller('ai-assistant')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiAssistantController {
  constructor(
    private readonly playerResolver: PlayerResolverService,
    private readonly rkjoAi: RkjoAiAdapterService,
  ) {}

  @Get('status')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN, Role.OFFICIEL)
  status() {
    return this.rkjoAi.status();
  }

  @Get('players/resolve')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN, Role.OFFICIEL)
  resolvePlayer(
    @CurrentActor() actor: AuthenticatedActor,
    @Query('organizationId') organizationId: string,
    @Query('q') query: string,
  ) {
    return this.playerResolver.resolve(actor, organizationId, query);
  }

  @Post('regulations/answer')
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN, Role.OFFICIEL)
  answerRegulation(
    @Body() body: {
      question: string;
      season?: string;
      competition?: string;
      authority?: string;
    },
  ) {
    return this.rkjoAi.answerRegulationQuestion(body.question, {
      domain: 'football',
      corpus: 'lfpb-regulations',
      ...(body.season ? { season: body.season } : {}),
      ...(body.competition ? { competition: body.competition } : {}),
      ...(body.authority ? { authority: body.authority } : {}),
    });
  }
}
