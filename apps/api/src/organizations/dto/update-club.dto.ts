import { IsOptional, IsString, Length } from "class-validator";

export class UpdateClubDto {
  @IsOptional()
  @IsString()
  @Length(2, 50)
  shortName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  colors?: string;
}
