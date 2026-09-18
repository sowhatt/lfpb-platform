import { IsIn, IsString, MinLength } from 'class-validator';

export class ChangeMatchStatusDto {
  @IsIn(['POSTPONED', 'CANCELLED'])
  status!: 'POSTPONED' | 'CANCELLED';

  @IsString()
  @MinLength(3)
  reason!: string;
}
