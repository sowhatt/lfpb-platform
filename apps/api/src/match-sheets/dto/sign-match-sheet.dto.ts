import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export enum MatchSheetSignatureRole {
  HOME_REPRESENTATIVE = 'HOME_REPRESENTATIVE',
  AWAY_REPRESENTATIVE = 'AWAY_REPRESENTATIVE',
  OFFICIAL = 'OFFICIAL',
}

export class SignMatchSheetDto {
  @IsEnum(MatchSheetSignatureRole)
  role!: MatchSheetSignatureRole;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  signerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  signerFunction?: string;
}
