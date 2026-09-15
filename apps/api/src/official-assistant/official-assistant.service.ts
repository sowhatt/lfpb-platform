import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranscribeAudioDto } from './dto/transcribe-audio.dto';

export type VoiceEventType = 'GOAL' | 'YELLOW_CARD' | 'RED_CARD' | 'SUBSTITUTION' | 'INCIDENT' | 'FINAL_SCORE' | 'NOTE';
export interface VoiceEventDraft { type: VoiceEventType; minute?: number; playerNumber?: number; replacementPlayerNumber?: number; transcript: string; confidence: number; needsConfirmation: true; }

const AUDIO_TYPES: Record<string, { mimeType: string; extension: string }> = {
  'audio/webm': { mimeType: 'audio/webm', extension: 'webm' }, 'audio/ogg': { mimeType: 'audio/ogg', extension: 'ogg' }, 'audio/mp4': { mimeType: 'audio/mp4', extension: 'mp4' }, 'audio/x-m4a': { mimeType: 'audio/mp4', extension: 'm4a' }, 'audio/m4a': { mimeType: 'audio/mp4', extension: 'm4a' }, 'audio/mpeg': { mimeType: 'audio/mpeg', extension: 'mp3' }, 'audio/mp3': { mimeType: 'audio/mpeg', extension: 'mp3' }, 'audio/wav': { mimeType: 'audio/wav', extension: 'wav' }, 'audio/x-wav': { mimeType: 'audio/wav', extension: 'wav' },
};

const FR_UNITS: Record<string, number> = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16 };
function frenchNumber(raw: string): number | undefined {
  const text = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/-/g, ' ').replace(/\bet\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^\d{1,3}$/.test(text)) return Number(text);
  if (FR_UNITS[text] !== undefined) return FR_UNITS[text];
  const tokens = text.split(' ');
  let total = 0; let current = 0;
  for (const token of tokens) {
    if (FR_UNITS[token] !== undefined) current += FR_UNITS[token];
    else if (token === 'vingt') current += 20;
    else if (token === 'trente') current += 30;
    else if (token === 'quarante') current += 40;
    else if (token === 'cinquante') current += 50;
    else if (token === 'soixante') current += 60;
    else if (token === 'cent') { current = Math.max(1, current) * 100; }
    else if (token === 'quatre' && tokens.includes('vingt')) continue;
    else return undefined;
  }
  total += current;
  return total || undefined;
}
function extractMinute(normalized: string): number | undefined {
  const digit = /(?:a|vers)?\s*(?:la\s+)?(\d{1,3})(?:e|eme|ere|re)?\s+minute/.exec(normalized);
  if (digit) return Number(digit[1]);
  const words = /(?:a|vers)?\s*(?:la\s+)?([a-z -]{2,40}?)(?:ieme|eme|ere|re)?\s+minute/.exec(normalized);
  return words ? frenchNumber(words[1]) : undefined;
}

@Injectable()
export class OfficialAssistantService {
  constructor(private readonly config: ConfigService) {}
  interpret(transcript: string): VoiceEventDraft {
    const normalized = transcript.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');
    const numbers = [...normalized.matchAll(/(?:num(?:e|é)ro|n[°º])\s*(\d{1,2})/gi)].map((match) => Number(match[1]));
    const minute = extractMinute(normalized);
    let type: VoiceEventType = 'NOTE'; let confidence = 0.55;
    if (/carton\s+jaune/.test(normalized)) { type = 'YELLOW_CARD'; confidence = 0.95; }
    else if (/carton\s+rouge|exclusion/.test(normalized)) { type = 'RED_CARD'; confidence = 0.95; }
    else if (/remplace|remplacement|sort\s+et|entre\s+a\s+la\s+place/.test(normalized)) { type = 'SUBSTITUTION'; confidence = 0.9; }
    else if (/\bbut\b|a\s+marqu/.test(normalized)) { type = 'GOAL'; confidence = 0.9; }
    else if (/score\s+final|fin\s+du\s+match/.test(normalized)) { type = 'FINAL_SCORE'; confidence = 0.85; }
    else if (/incident|blessure|envahissement|bagarre|tribune/.test(normalized)) { type = 'INCIDENT'; confidence = 0.82; }
    if (minute !== undefined && (minute < 0 || minute > 180)) throw new BadRequestException('La minute détectée est hors limites');
    return { type, ...(minute !== undefined ? { minute } : {}), ...(numbers[0] !== undefined ? { playerNumber: numbers[0] } : {}), ...(numbers[1] !== undefined ? { replacementPlayerNumber: numbers[1] } : {}), transcript: transcript.trim(), confidence, needsConfirmation: true };
  }

  async createLiveSession(sdp: string) {
    const apiKey = this.config.get<string>('TRANSCRIPTION_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('Le service de transcription Live n’est pas configuré');
    const endpoint = this.config.get<string>('TRANSCRIPTION_LIVE_API_URL') ?? 'https://api.openai.com/v1/live/sessions';
    const liveModel = this.config.get<string>('TRANSCRIPTION_LIVE_MODEL') ?? 'gpt-live-1';
    const normalizedSdp = sdp.replace(/\r?\n/g, '\r\n'); const framedSdp = normalizedSdp.endsWith('\r\n') ? normalizedSdp : `${normalizedSdp}\r\n`;
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ session: { model: liveModel, instructions: 'Transcris fidèlement en français les annonces d’arbitrage football. Préserve les noms de clubs, numéros de maillot et minutes annoncées.', store: false, client: { data_channel: { allowed_client_events: [], allowed_server_events: [{ type: 'session.started' }, { type: 'session.input_transcript.delta' }, { type: 'session.closed' }, { type: 'error' }] } } }, transport: { type: 'webrtc', sdp: framedSdp } }) });
    if (!response.ok) { const detail = await response.text().catch(() => ''); throw new BadGatewayException(detail ? `Session Live indisponible : ${detail.slice(0, 300)}` : 'La session Live est momentanément indisponible'); }
    const payload = await response.json() as { session?: { id?: unknown }; transport?: { type?: unknown; sdp?: unknown } };
    if (typeof payload.session?.id !== 'string' || payload.transport?.type !== 'webrtc' || typeof payload.transport?.sdp !== 'string') throw new BadGatewayException('OpenAI a renvoyé une session Live invalide');
    return { sessionId: payload.session.id, sdp: payload.transport.sdp };
  }

  async transcribe(input: TranscribeAudioDto): Promise<{ text: string } | { sessionId: string; sdp: string }> {
    if (input.sdp?.trim()) return this.createLiveSession(input.sdp);
    if (!input.audioDataUrl) throw new BadRequestException('Un enregistrement audio ou une offre SDP est requis');
    const apiKey = this.config.get<string>('TRANSCRIPTION_API_KEY'); const endpoint = this.config.get<string>('TRANSCRIPTION_API_URL');
    if (!apiKey || !endpoint) throw new ServiceUnavailableException('Le service de transcription n’est pas configuré');
    const commaIndex = input.audioDataUrl.indexOf(','); if (commaIndex < 0) throw new BadRequestException('Format audio non pris en charge');
    const header = input.audioDataUrl.slice(0, commaIndex).trim(); const encoded = input.audioDataUrl.slice(commaIndex + 1).replace(/\s/g, ''); const headerMatch = /^data:([^;,]+)(?:;[^,]*)?;base64$/i.exec(header);
    if (!headerMatch || !encoded) throw new BadRequestException('Format audio non pris en charge');
    const rawMimeType = headerMatch[1].toLowerCase(); const audioType = AUDIO_TYPES[rawMimeType]; if (!audioType) throw new BadRequestException('Format audio non pris en charge');
    const bytes = Buffer.from(encoded, 'base64'); if (bytes.byteLength === 0 || bytes.byteLength > 5_000_000) throw new BadRequestException('L’enregistrement doit faire moins de 5 Mo');
    const form = new FormData(); form.append('file', new Blob([bytes], { type: audioType.mimeType }), `dictee.${audioType.extension}`); form.append('model', this.config.get<string>('TRANSCRIPTION_FILE_MODEL') ?? 'gpt-transcribe'); form.append('language', input.language);
    const context = input.context?.trim(); if (context) form.append('prompt', `Contexte football. Préserve exactement si possible les noms propres suivants : ${context.slice(0, 3500)}`);
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form });
    if (!response.ok) { const detail = await response.text().catch(() => ''); throw new BadGatewayException(detail ? `La transcription est momentanément indisponible : ${detail.slice(0, 240)}` : 'La transcription est momentanément indisponible'); }
    const payload = await response.json() as { text?: unknown }; if (typeof payload.text !== 'string' || !payload.text.trim()) throw new BadGatewayException('Le service de transcription a renvoyé une réponse invalide');
    return { text: payload.text.trim() };
  }
}
