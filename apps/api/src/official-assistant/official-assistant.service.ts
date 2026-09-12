import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranscribeAudioDto } from './dto/transcribe-audio.dto';

export type VoiceEventType =
  | 'GOAL'
  | 'YELLOW_CARD'
  | 'RED_CARD'
  | 'SUBSTITUTION'
  | 'INCIDENT'
  | 'FINAL_SCORE'
  | 'NOTE';

export interface VoiceEventDraft {
  type: VoiceEventType;
  minute?: number;
  playerNumber?: number;
  replacementPlayerNumber?: number;
  transcript: string;
  confidence: number;
  needsConfirmation: true;
}

const AUDIO_TYPES: Record<string, { mimeType: string; extension: string }> = {
  'audio/webm': { mimeType: 'audio/webm', extension: 'webm' },
  'audio/ogg': { mimeType: 'audio/ogg', extension: 'ogg' },
  'audio/mp4': { mimeType: 'audio/mp4', extension: 'mp4' },
  'audio/x-m4a': { mimeType: 'audio/mp4', extension: 'm4a' },
  'audio/m4a': { mimeType: 'audio/mp4', extension: 'm4a' },
  'audio/mpeg': { mimeType: 'audio/mpeg', extension: 'mp3' },
  'audio/mp3': { mimeType: 'audio/mpeg', extension: 'mp3' },
  'audio/wav': { mimeType: 'audio/wav', extension: 'wav' },
  'audio/x-wav': { mimeType: 'audio/wav', extension: 'wav' },
};

@Injectable()
export class OfficialAssistantService {
  constructor(private readonly config: ConfigService) {}

  interpret(transcript: string): VoiceEventDraft {
    const normalized = transcript.trim().toLocaleLowerCase('fr-FR');
    const numbers = [...normalized.matchAll(/(?:num(?:é|e)ro|n[°º])\s*(\d{1,2})/gi)].map(
      (match) => Number(match[1]),
    );
    const minuteMatch = /(?:à|a|vers)\s+la\s+(\d{1,3})(?:e|ème|ere|re)?\s+minute/.exec(normalized)
      ?? /(\d{1,3})(?:e|ème|ere|re)?\s+minute/.exec(normalized);
    const minute = minuteMatch ? Number(minuteMatch[1]) : undefined;

    let type: VoiceEventType = 'NOTE';
    let confidence = 0.55;
    if (/carton\s+jaune/.test(normalized)) { type = 'YELLOW_CARD'; confidence = 0.95; }
    else if (/carton\s+rouge|exclusion/.test(normalized)) { type = 'RED_CARD'; confidence = 0.95; }
    else if (/remplace|remplacement|sort\s+et|entre\s+à\s+la\s+place/.test(normalized)) { type = 'SUBSTITUTION'; confidence = 0.9; }
    else if (/\bbut\b|a\s+marqu/.test(normalized)) { type = 'GOAL'; confidence = 0.9; }
    else if (/score\s+final|fin\s+du\s+match/.test(normalized)) { type = 'FINAL_SCORE'; confidence = 0.85; }
    else if (/incident|blessure|envahissement|bagarre|tribune/.test(normalized)) { type = 'INCIDENT'; confidence = 0.82; }

    if (minute !== undefined && (minute < 0 || minute > 180)) {
      throw new BadRequestException('La minute détectée est hors limites');
    }

    return {
      type,
      ...(minute !== undefined ? { minute } : {}),
      ...(numbers[0] !== undefined ? { playerNumber: numbers[0] } : {}),
      ...(numbers[1] !== undefined ? { replacementPlayerNumber: numbers[1] } : {}),
      transcript: transcript.trim(),
      confidence,
      needsConfirmation: true,
    };
  }

  async transcribe(input: TranscribeAudioDto): Promise<{ text: string }> {
    const apiKey = this.config.get<string>('TRANSCRIPTION_API_KEY');
    const endpoint = this.config.get<string>('TRANSCRIPTION_API_URL');
    if (!apiKey || !endpoint) {
      throw new ServiceUnavailableException('Le service de transcription n’est pas configuré');
    }

    const commaIndex = input.audioDataUrl.indexOf(',');
    if (commaIndex < 0) throw new BadRequestException('Format audio non pris en charge');

    const header = input.audioDataUrl.slice(0, commaIndex).trim();
    const encoded = input.audioDataUrl.slice(commaIndex + 1).replace(/\s/g, '');
    const headerMatch = /^data:([^;,]+)(?:;[^,]*)?;base64$/i.exec(header);
    if (!headerMatch || !encoded) throw new BadRequestException('Format audio non pris en charge');

    const rawMimeType = headerMatch[1].toLowerCase();
    const audioType = AUDIO_TYPES[rawMimeType];
    if (!audioType) throw new BadRequestException('Format audio non pris en charge');

    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.byteLength === 0 || bytes.byteLength > 5_000_000) {
      throw new BadRequestException('L’enregistrement doit faire moins de 5 Mo');
    }

    const form = new FormData();
    form.append(
      'file',
      new Blob([bytes], { type: audioType.mimeType }),
      `dictee.${audioType.extension}`,
    );
    form.append('model', this.config.get<string>('TRANSCRIPTION_MODEL') ?? 'gpt-transcribe');
    form.append('language', input.language);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!response.ok) throw new BadGatewayException('La transcription est momentanément indisponible');

    const payload = await response.json() as { text?: unknown };
    if (typeof payload.text !== 'string' || !payload.text.trim()) {
      throw new BadGatewayException('Le service de transcription a renvoyé une réponse invalide');
    }
    return { text: payload.text.trim() };
  }
}
