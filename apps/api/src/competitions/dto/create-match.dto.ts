import { IsDateString, IsUUID } from 'class-validator';

export class CreateMatchDto {
  @IsUUID()
  roundId!: string;

  @IsUUID()
  venueId!: string;

  @IsUUID()
  homeClubId!: string;

  @IsUUID()
  awayClubId!: string;

  @IsDateString()
  kickoffAt!: string;
}
