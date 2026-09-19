import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class HomologateMatchDto {
  @IsInt()
  @Min(0)
  officialHomeScore!: number;

  @IsInt()
  @Min(0)
  officialAwayScore!: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason?: string;
}
