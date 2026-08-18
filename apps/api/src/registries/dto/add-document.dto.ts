import { DocumentType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class AddDocumentDto {
  @IsEnum(DocumentType)
  type!: DocumentType;

  @IsString()
  @Length(3, 500)
  storageKey!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
