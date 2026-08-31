import { IsIn, IsOptional, IsString, Length } from "class-validator";

export class RespondAssignmentDto {
  @IsIn(["ACCEPTED", "REFUSED"])
  decision!: "ACCEPTED" | "REFUSED";

  @IsOptional()
  @IsString()
  @Length(3, 500)
  reason?: string;
}
