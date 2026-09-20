import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentActor } from "../iam/current-actor.decorator";
import { AuthenticatedActor } from "../iam/domain/actor";
import { Roles } from "../iam/roles.decorator";
import { RolesGuard } from "../iam/roles.guard";
import { CreateClubDto } from "./dto/create-club.dto";
import { RenameClubDto } from "./dto/rename-club.dto";
import { UpdateClubDto } from "./dto/update-club.dto";
import { UpdateClubStatusDto } from "./dto/update-club-status.dto";
import { UpsertClubSeasonDto } from "./dto/upsert-club-season.dto";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(@CurrentActor() actor: AuthenticatedActor) {
    return this.organizations.listFor(actor);
  }

  @Get(":organizationId")
  findOne(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
  ) {
    return this.organizations.findOneFor(actor, organizationId);
  }

  @Post("clubs")
  @Roles(Role.LIGUE_ADMIN)
  createClub(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: CreateClubDto,
  ) {
    return this.organizations.createClub(actor, input);
  }

  @Patch(":organizationId/club")
  @Roles(Role.LIGUE_ADMIN)
  updateClub(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() input: UpdateClubDto,
  ) {
    return this.organizations.updateClub(actor, organizationId, input);
  }

  @Post(":organizationId/club/rename")
  @Roles(Role.LIGUE_ADMIN)
  renameClub(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() input: RenameClubDto,
  ) {
    return this.organizations.renameClub(actor, organizationId, input);
  }

  @Patch(":organizationId/club/status")
  @Roles(Role.LIGUE_ADMIN)
  updateClubStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() input: UpdateClubStatusDto,
  ) {
    return this.organizations.updateClubStatus(actor, organizationId, input);
  }

  @Put(":organizationId/club/seasons/:seasonId")
  @Roles(Role.LIGUE_ADMIN)
  upsertClubSeason(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("seasonId", ParseUUIDPipe) seasonId: string,
    @Body() input: UpsertClubSeasonDto,
  ) {
    return this.organizations.upsertClubSeason(
      actor,
      organizationId,
      seasonId,
      input,
    );
  }
}
