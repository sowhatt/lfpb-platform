import { IsIn, IsString, MaxLength } from 'class-validator';

export class TranscribeAudioDto {
  @IsString()
  @MaxLength(8_000_000)
  audioDataUrl!: string;

  @IsIn(['fr', 'en'])
  language: 'fr' | 'en' = 'fr';
}
