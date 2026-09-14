import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { IamModule } from '../iam/iam.module';
import { MatchSheetPlayerControlsService } from './match-sheet-player-controls.service';
import { MatchSheetSignaturesService } from './match-sheet-signatures.service';
import { MatchSheetsController } from './match-sheets.controller';
import { MatchSheetsService } from './match-sheets.service';

@Module({
  imports: [AuthModule, DatabaseModule, IamModule],
  controllers: [MatchSheetsController],
  providers: [MatchSheetsService, MatchSheetPlayerControlsService, MatchSheetSignaturesService],
  exports: [MatchSheetsService, MatchSheetPlayerControlsService, MatchSheetSignaturesService],
})
export class MatchSheetsModule {}
