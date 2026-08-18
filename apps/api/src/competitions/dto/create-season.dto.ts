import { IsDateString, IsString, Length } from 'class-validator';

export class CreateSeasonDto {
  @IsString()
  @Length(4, 30)
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
