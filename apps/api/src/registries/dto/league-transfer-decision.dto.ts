import { PlayerTransferStatus } from "@prisma/client";
import { IsIn, IsOptional, IsString, Length } from "class-validator";

export class LeagueTransferDecisionDto {
  @IsIn([PlayerTransferStatus.APPROVED, PlayerTransferStatus.REJECTED])
  decision!: PlayerTransferStatus;

  @IsOptional()
  @IsString()
  @Length(3, 500)
  reason?: string;
}
