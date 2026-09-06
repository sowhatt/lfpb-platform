import { MatchSheetPlayerRole } from '@prisma/client';
import { IsEnum, IsInt, IsUUID, Max, Min } from 'class-validator';

export class AddMatchSheetPlayerDto {
  @IsUUID()
  clubId!: string;

  @IsUUID()
  registrationId!: string;

  @IsEnum(MatchSheetPlayerRole)
  role!: MatchSheetPlayerRole;

  @IsInt()
  @Min(1)
  @Max(99)
  shirtNumber!: number;
}
