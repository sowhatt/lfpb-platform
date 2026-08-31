import { VenueAssignmentType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class AssignClubVenueDto {
  @IsUUID()
  venueId!: string;

  @IsEnum(VenueAssignmentType)
  type!: VenueAssignmentType;

  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;
}
