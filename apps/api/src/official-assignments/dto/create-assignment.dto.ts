import { MatchOfficialRole } from "@prisma/client";
import { IsEnum, IsUUID } from "class-validator";

export class CreateAssignmentDto {
  @IsUUID()
  matchId!: string;

  @IsUUID()
  officialProfileId!: string;

  @IsEnum(MatchOfficialRole)
  role!: MatchOfficialRole;
}
