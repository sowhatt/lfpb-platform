import { PlayerPosition } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

export class CreatePlayerDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @Length(1, 80)
  firstName!: string;

  @IsString()
  @Length(1, 80)
  lastName!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La date de naissance doit être au format AAAA-MM-JJ avec une année à 4 chiffres' })
  @IsDateString({ strict: true }, { message: 'La date de naissance est invalide' })
  birthDate!: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  nationality?: string;

  @IsEnum(PlayerPosition)
  position!: PlayerPosition;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  shirtName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  shirtNumber?: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La date d’arrivée doit être au format AAAA-MM-JJ avec une année à 4 chiffres' })
  @IsDateString({ strict: true }, { message: 'La date d’arrivée est invalide' })
  startDate!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La date de fin doit être au format AAAA-MM-JJ avec une année à 4 chiffres' })
  @IsDateString({ strict: true }, { message: 'La date de fin est invalide' })
  endDate?: string;
}
