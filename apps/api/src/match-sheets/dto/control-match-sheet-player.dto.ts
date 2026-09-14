import { IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export enum MatchSheetPlayerControlStatus {
  VERIFIED = 'VERIFIED',
  ANOMALY = 'ANOMALY',
}

export class ControlMatchSheetPlayerDto {
  @IsEnum(MatchSheetPlayerControlStatus)
  status!: MatchSheetPlayerControlStatus;

  @ValidateIf((input) => input.status === MatchSheetPlayerControlStatus.ANOMALY)
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_500_000)
  evidencePhotoDataUrl?: string;
}
