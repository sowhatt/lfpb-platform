import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentActor } from "../iam/current-actor.decorator";
import { AuthenticatedActor } from "../iam/domain/actor";
import { Roles } from "../iam/roles.decorator";
import { RolesGuard } from "../iam/roles.guard";
import { CreatePlayerTransferDto } from "./dto/create-player-transfer.dto";
import { FormerClubTransferDecisionDto } from "./dto/former-club-transfer-decision.dto";
import { LeagueTransferDecisionDto } from "./dto/league-transfer-decision.dto";
import { PlayerTransfersService } from "./player-transfers.service";

@Controller("registries/player-transfers")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlayerTransfersController {
  constructor(private readonly playerTransfers: PlayerTransfersService) {}

  @Get()
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  list(@CurrentActor() actor: AuthenticatedActor) {
    return this.playerTransfers.list(actor);
  }

  @Get("candidates/search")
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  searchCandidates(
    @CurrentActor() actor: AuthenticatedActor,
    @Query("q") query: string,
  ) {
    return this.playerTransfers.searchCandidates(actor, query);
  }

  @Get(":transferId")
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  get(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("transferId", ParseUUIDPipe) transferId: string,
  ) {
    return this.playerTransfers.get(actor, transferId);
  }

  @Post(":transferId/effective")
  @Roles(Role.LIGUE_ADMIN)
  makeEffective(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("transferId", ParseUUIDPipe) transferId: string,
  ) {
    return this.playerTransfers.makeEffective(actor, transferId);
  }

  @Post(":transferId/league-decision")
  @Roles(Role.LIGUE_ADMIN)
  leagueDecision(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("transferId", ParseUUIDPipe) transferId: string,
    @Body() input: LeagueTransferDecisionDto,
  ) {
    return this.playerTransfers.leagueDecision(actor, transferId, input);
  }

  @Post(":transferId/league-review")
  @Roles(Role.LIGUE_ADMIN)
  startLeagueReview(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("transferId", ParseUUIDPipe) transferId: string,
  ) {
    return this.playerTransfers.startLeagueReview(actor, transferId);
  }

  @Post(":transferId/former-club-decision")
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  formerClubDecision(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("transferId", ParseUUIDPipe) transferId: string,
    @Body() input: FormerClubTransferDecisionDto,
  ) {
    return this.playerTransfers.formerClubDecision(actor, transferId, input);
  }

  @Post(":transferId/submit")
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  submit(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("transferId", ParseUUIDPipe) transferId: string,
  ) {
    return this.playerTransfers.submit(actor, transferId);
  }

  @Post()
  @Roles(Role.LIGUE_ADMIN, Role.CLUB_ADMIN)
  create(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: CreatePlayerTransferDto,
  ) {
    return this.playerTransfers.create(actor, input);
  }
}
