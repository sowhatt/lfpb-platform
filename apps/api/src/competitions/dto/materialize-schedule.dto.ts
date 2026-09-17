import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class MaterializeScheduleDto {
  @IsDateString()
  startDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  allowedWeekdays!: number[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { each: true })
  kickoffTimes!: string[];
}
