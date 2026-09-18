import { IsISO8601, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateMatchScheduleDto {
  @IsOptional()
  @IsISO8601()
  kickoffAt?: string;

  @IsOptional()
  @IsUUID('4')
  venueId?: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}
