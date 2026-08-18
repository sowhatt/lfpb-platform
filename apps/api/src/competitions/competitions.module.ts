import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from '../iam/iam.module';
import { CompetitionsController } from './competitions.controller';
import { CompetitionsService } from './competitions.service';
import { FixturePlannerService } from './fixture-planner.service';

@Module({
  imports: [AuthModule, IamModule],
  controllers: [CompetitionsController],
  providers: [CompetitionsService, FixturePlannerService],
})
export class CompetitionsModule {}
