import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { DisciplineModule } from '../discipline/discipline.module';
import { MatchEventsController } from './match-events.controller';
import { MatchEventsService } from './match-events.service';

@Module({
  imports: [AuthModule, DatabaseModule, DisciplineModule],
  controllers: [MatchEventsController],
  providers: [MatchEventsService],
})
export class MatchEventsModule {}
