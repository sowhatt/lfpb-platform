import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DisciplineService } from './discipline.service';

@Module({
  imports: [DatabaseModule],
  providers: [DisciplineService],
  exports: [DisciplineService],
})
export class DisciplineModule {}
