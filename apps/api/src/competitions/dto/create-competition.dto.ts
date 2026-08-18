import { CompetitionFormat, Division } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class CreateCompetitionDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  seasonId!: string;

  @IsString()
  @Length(3, 120)
  name!: string;

  @IsString()
  @Length(2, 30)
  @Matches(/^[A-Z0-9_-]+$/)
  code!: string;

  @IsOptional()
  @IsEnum(Division)
  division?: Division;

  @IsEnum(CompetitionFormat)
  format!: CompetitionFormat;
}
