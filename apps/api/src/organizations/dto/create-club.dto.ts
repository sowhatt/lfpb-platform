import { Division } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class CreateClubDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Length(2, 20)
  code!: string;

  @IsString()
  @Length(2, 50)
  shortName!: string;

  @IsEnum(Division)
  division!: Division;

  @IsOptional()
  @IsString()
  city?: string;
}
