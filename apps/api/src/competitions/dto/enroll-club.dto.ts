import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class EnrollClubDto {
  @IsUUID()
  clubId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seed?: number;
}
