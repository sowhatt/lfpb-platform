import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdatePlanningRulesDto {
  @IsOptional()
  @IsInt()
  @Min(24)
  @Max(168)
  minRestHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxConsecutiveHome?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxConsecutiveAway?: number;
}
