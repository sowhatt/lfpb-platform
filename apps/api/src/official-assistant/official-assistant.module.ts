import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from '../iam/iam.module';
import { OfficialAssistantController } from './official-assistant.controller';
import { OfficialAssistantService } from './official-assistant.service';

@Module({
  imports: [AuthModule, IamModule],
  controllers: [OfficialAssistantController],
  providers: [OfficialAssistantService],
})
export class OfficialAssistantModule {}
