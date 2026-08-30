import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CreateAssignmentDto } from "./dto/create-assignment.dto";
import { RespondAssignmentDto } from "./dto/respond-assignment.dto";
import { OfficialAssignmentsService } from "./official-assignments.service";

@Controller("official-assignments")
@UseGuards(JwtAuthGuard, RolesGuard)
export class OfficialAssignmentsController {
  constructor(private readonly assignments: OfficialAssignmentsService) {}

  @Get()
  @Roles(Role.LIGUE_ADMIN, Role.OFFICIEL)
  list(
    @CurrentActor() actor: AuthenticatedActor,
    @Query("matchId") matchId?: string,
  ) {
    return this.assignments.list(actor, matchId);
  }

  @Post()
  @Roles(Role.LIGUE_ADMIN)
  create(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: CreateAssignmentDto,
  ) {
    return this.assignments.create(actor, input);
  }

  @Patch(":id/send")
  @Roles(Role.LIGUE_ADMIN)
  send(@Param("id", ParseUUIDPipe) id: string) {
    return this.assignments.send(id);
  }

  @Patch(":id/respond")
  @Roles(Role.OFFICIEL)
  respond(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RespondAssignmentDto,
  ) {
    return this.assignments.respond(actor, id, input);
  }

  @Patch(":id/cancel")
  @Roles(Role.LIGUE_ADMIN)
  cancel(@Param("id", ParseUUIDPipe) id: string) {
    return this.assignments.cancel(id);
  }
}
