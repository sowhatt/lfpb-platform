import { PlayerTransferStatus } from "@prisma/client";
import { IsIn, IsOptional, IsString, Length } from "class-validator";

export class FormerClubTransferDecisionDto {
  @IsIn([PlayerTransferStatus.AGREED, PlayerTransferStatus.OPPOSED])
  decision!: PlayerTransferStatus;

  @IsOptional()
  @IsString()
  @Length(3, 500)
  reason?: string;
}
