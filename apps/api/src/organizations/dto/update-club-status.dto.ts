import { IsBoolean, IsOptional, IsString, Length } from "class-validator";

export class UpdateClubStatusDto {
  @IsBoolean()
  active!: boolean;

  @IsOptional()
  @IsString()
  @Length(2, 500)
  reason?: string;
}
