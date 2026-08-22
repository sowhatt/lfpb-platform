import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateVenueDto {
  @IsString()
  @Length(3, 120)
  name!: string;

  @IsString()
  @Length(2, 80)
  city!: string;

  @IsOptional()
  @IsString()
  @Length(3, 200)
  address?: string;

  @IsOptional()
  @IsString()
  @Length(3, 80)
  pitchSurface?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  approved?: boolean;
}
