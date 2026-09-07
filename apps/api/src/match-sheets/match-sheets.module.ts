import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { IamModule } from '../iam/iam.module';
import { MatchSheetsController } from './match-sheets.controller';
import { MatchSheetsService } from './match-sheets.service';

@Module({
  imports: [AuthModule, DatabaseModule, IamModule],
  controllers: [MatchSheetsController],
  providers: [MatchSheetsService],
  exports: [MatchSheetsService],
})
export class MatchSheetsModule {}
