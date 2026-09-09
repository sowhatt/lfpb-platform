import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MatchEventsController } from './match-events.controller';
import { MatchEventsService } from './match-events.service';

@Module({
  imports: [DatabaseModule],
  controllers: [MatchEventsController],
  providers: [MatchEventsService],
})
export class MatchEventsModule {}
