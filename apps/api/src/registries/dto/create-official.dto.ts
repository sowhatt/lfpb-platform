import { OfficialFunction } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateOfficialDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @Length(1, 80)
  firstName!: string;

  @IsString()
  @Length(1, 80)
  lastName!: string;

  @IsDateString()
  birthDate!: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  nationality?: string;

  @IsEnum(OfficialFunction)
  function!: OfficialFunction;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  grade?: string;

  @IsDateString()
  startDate!: string;
}
