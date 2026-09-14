import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateLiveSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200_000)
  sdp!: string;
}
