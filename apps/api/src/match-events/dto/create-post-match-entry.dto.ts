import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum PostMatchEntryType {
  TECHNICAL_RESERVE = 'TECHNICAL_RESERVE',
  POST_MATCH_OBSERVATION = 'POST_MATCH_OBSERVATION',
  OFFICIAL_INCIDENT_REPORT = 'OFFICIAL_INCIDENT_REPORT',
}

export class CreatePostMatchEntryDto {
  @IsEnum(PostMatchEntryType)
  type!: PostMatchEntryType;

  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsUUID()
  clubId?: string;

  @IsOptional()
  @IsUUID()
  registrationId?: string;
}
