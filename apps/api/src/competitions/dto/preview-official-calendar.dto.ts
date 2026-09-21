import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OfficialCalendarRowDto {
  @IsInt()
  @Min(1)
  roundNumber!: number;

  @IsString()
  @Length(1, 80)
  matchNumber!: string;

  @IsString()
  @Length(1, 160)
  homeClub!: string;

  @IsString()
  @Length(1, 160)
  awayClub!: string;

  @IsString()
  @Length(1, 40)
  date!: string;

  @IsString()
  @Length(1, 20)
  time!: string;

  @IsString()
  @Length(1, 160)
  venue!: string;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  city?: string;
}

export class PreviewOfficialCalendarDto {
  @IsString()
  @Length(1, 160)
  sourceName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OfficialCalendarRowDto)
  rows!: OfficialCalendarRowDto[];
}
