import { IsDateString, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateLicenseDto {
  @IsUUID()
  registrationId!: string;

  @IsOptional()
  @IsString()
  @Length(3, 40)
  number?: string;

  @IsString()
  @Length(4, 20)
  season!: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
