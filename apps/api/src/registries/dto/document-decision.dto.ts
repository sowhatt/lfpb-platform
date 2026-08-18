import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class DocumentDecisionDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @Length(3, 500)
  reason?: string;
}
