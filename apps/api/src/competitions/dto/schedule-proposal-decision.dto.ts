import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class ScheduleProposalDecisionDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @Length(3, 500)
  reason?: string;
}
