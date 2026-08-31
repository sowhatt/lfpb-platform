import { IsDateString, IsString, Length } from 'class-validator';

export class CreateVenueUnavailabilityDto {
  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsString()
  @Length(3, 300)
  reason!: string;
}
