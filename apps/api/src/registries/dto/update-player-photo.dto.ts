import { IsString, Matches, MaxLength } from 'class-validator';

export class UpdatePlayerPhotoDto {
  @IsString()
  @MaxLength(1_100_000, {
    message: 'La photo est trop volumineuse',
  })
  @Matches(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/, {
    message: 'La photo doit être une image JPEG, PNG ou WebP valide',
  })
  photoDataUrl!: string;
}
