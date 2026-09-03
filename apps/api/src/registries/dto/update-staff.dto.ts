import { StaffFunction } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class UpdateStaffDto {
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

  @IsEnum(StaffFunction)
  function!: StaffFunction;

  @IsOptional()
  @IsString()
  @Length(2, 160)
  qualification?: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
