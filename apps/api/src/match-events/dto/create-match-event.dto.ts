import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export enum LiveMatchEventType {
  MATCH_START = 'MATCH_START',
  HALF_TIME = 'HALF_TIME',
  SECOND_HALF_START = 'SECOND_HALF_START',
  GOAL = 'GOAL',
  YELLOW_CARD = 'YELLOW_CARD',
  RED_CARD = 'RED_CARD',
  SUBSTITUTION = 'SUBSTITUTION',
  INCIDENT = 'INCIDENT',
  INJURY = 'INJURY',
  OBSERVATION = 'OBSERVATION',
  MATCH_END = 'MATCH_END',
}

export enum MatchEventPeriod {
  FIRST_HALF = 'FIRST_HALF',
  SECOND_HALF = 'SECOND_HALF',
  EXTRA_TIME_FIRST = 'EXTRA_TIME_FIRST',
  EXTRA_TIME_SECOND = 'EXTRA_TIME_SECOND',
  PENALTIES = 'PENALTIES',
}

export class CreateMatchEventDto {
  @IsEnum(LiveMatchEventType)
  type!: LiveMatchEventType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(130)
  minute?: number;

  @IsOptional()
  @IsEnum(MatchEventPeriod)
  period?: MatchEventPeriod;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  stoppageMinute?: number;

  @IsOptional()
  @IsUUID()
  clubId?: string;

  @IsOptional()
  @IsUUID()
  registrationId?: string;

  @IsOptional()
  @IsUUID()
  secondaryRegistrationId?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
