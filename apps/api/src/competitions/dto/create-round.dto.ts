import { IsDateString, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateRoundDto {
  @IsInt()
  @Min(1)
  number!: number;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
