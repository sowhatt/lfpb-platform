import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class TranscribeAudioDto {
  @IsOptional()
  @IsString()
  @MaxLength(8_000_000)
  audioDataUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  sdp?: string;

  @IsOptional()
  @IsIn(['fr', 'en'])
  language: 'fr' | 'en' = 'fr';
}
