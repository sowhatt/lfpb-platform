import { ClubSeasonOutcome, Division } from "@prisma/client";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class UpsertClubSeasonDto {
  @IsEnum(Division)
  division!: Division;

  @IsOptional()
  @IsInt()
  @Min(1)
  finalRank?: number;

  @IsOptional()
  @IsEnum(ClubSeasonOutcome)
  outcome?: ClubSeasonOutcome;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
