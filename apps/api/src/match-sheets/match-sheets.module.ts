import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MatchSheetsController } from './match-sheets.controller';
import { MatchSheetsService } from './match-sheets.service';

@Module({
  imports: [DatabaseModule],
  controllers: [MatchSheetsController],
  providers: [MatchSheetsService],
  exports: [MatchSheetsService],
})
export class MatchSheetsModule {}
