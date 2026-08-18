import { LicenseStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export const LICENSE_DECISIONS = [LicenseStatus.APPROVED, LicenseStatus.REJECTED] as const;
export type LicenseDecision = (typeof LICENSE_DECISIONS)[number];

export class LicenseDecisionDto {
  @IsEnum(LICENSE_DECISIONS)
  decision!: LicenseDecision;

  @IsOptional()
  @IsString()
  @Length(3, 500)
  reason?: string;
}
