import { IsDateString, IsString, Length } from "class-validator";

export class RenameClubDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsDateString()
  effectiveDate!: string;

  @IsString()
  @Length(2, 500)
  reason!: string;
}
