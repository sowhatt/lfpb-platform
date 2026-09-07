import { IsUUID } from 'class-validator';

export class SubmitMatchSheetDto {
  @IsUUID()
  clubId!: string;
}
