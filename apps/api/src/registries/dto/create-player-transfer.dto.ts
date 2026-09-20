import { IsDateString, IsOptional, IsString, IsUUID, Length, Matches } from "class-validator";

export class CreatePlayerTransferDto {
  @IsUUID()
  personId!: string;

  @IsUUID()
  sourceRegistrationId!: string;

  @IsUUID()
  targetOrganizationId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "La date de prise d'effet doit être au format AAAA-MM-JJ",
  })
  @IsDateString({ strict: true }, {
    message: "La date de prise d'effet est invalide",
  })
  requestedStartDate!: string;

  @IsUUID()
  seasonId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}
