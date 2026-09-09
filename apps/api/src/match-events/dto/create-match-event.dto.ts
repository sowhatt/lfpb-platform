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
  MATCH_END = 'MATCH_END',
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
