import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { InterpretDictationDto } from './dto/interpret-dictation.dto';
import { TranscribeAudioDto } from './dto/transcribe-audio.dto';
import { OfficialAssistantService } from './official-assistant.service';

@Controller('official-assistant')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OFFICIEL)
export class OfficialAssistantController {
  constructor(private readonly assistant: OfficialAssistantService) {}

  @Post('transcriptions')
  transcribe(@Body() input: TranscribeAudioDto) {
    return this.assistant.transcribe(input);
  }

  @Post('interpretations')
  interpret(@Body() input: InterpretDictationDto) {
    return this.assistant.interpret(input.transcript);
  }
}
