import { LicenseStatus } from '@prisma/client';
import { IsDateString, IsIn, IsOptional, IsString, Length, ValidateIf } from 'class-validator';

export const LEAGUE_REVIEW_DECISIONS = [
  LicenseStatus.LEAGUE_FAVORABLE,
  LicenseStatus.INCOMPLETE,
] as const;
export type LeagueReviewDecision = (typeof LEAGUE_REVIEW_DECISIONS)[number];

export class LeagueReviewDto {
  @IsIn(LEAGUE_REVIEW_DECISIONS)
  decision!: LeagueReviewDecision;

  @ValidateIf((input: LeagueReviewDto) => input.decision === LicenseStatus.INCOMPLETE)
  @IsString()
  @Length(3, 500)
  reason?: string;
}

export const FEDERATION_DECISIONS = [
  LicenseStatus.ISSUED_BY_FBF,
  LicenseStatus.REJECTED_BY_FBF,
] as const;
export type FederationDecision = (typeof FEDERATION_DECISIONS)[number];

export class FederationDecisionDto {
  @IsIn(FEDERATION_DECISIONS)
  decision!: FederationDecision;

  @ValidateIf((input: FederationDecisionDto) => input.decision === LicenseStatus.ISSUED_BY_FBF)
  @IsString()
  @Length(3, 40)
  number?: string;

  @ValidateIf((input: FederationDecisionDto) => input.decision === LicenseStatus.REJECTED_BY_FBF)
  @IsString()
  @Length(3, 500)
  reason?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
