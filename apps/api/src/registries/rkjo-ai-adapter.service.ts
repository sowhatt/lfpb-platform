import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';

export type RkjoRagFilters = {
  metadata?: Record<string, string | number | boolean>;
};

export type RkjoRagAnswer = {
  answer: string;
  sanitized_query: string;
  sources: Array<{
    citation: number;
    document_id: string;
    chunk_id: string;
    score: number;
  }>;
};

@Injectable()
export class RkjoAiAdapterService {
  private readonly baseUrl = (process.env.RKJO_AI_BASE_URL ?? '').replace(/\/$/, '');
  private readonly apiKey = process.env.RKJO_AI_API_KEY ?? '';

  status() {
    return {
      configured: Boolean(this.baseUrl && this.apiKey),
      baseUrl: this.baseUrl || null,
      capabilities: ['rag-answer', 'rag-search', 'document-ingestion'],
    };
  }

  async answerRegulationQuestion(
    question: string,
    metadata: Record<string, string | number | boolean> = {},
  ): Promise<RkjoRagAnswer> {
    this.assertConfigured();
    return this.postJson<RkjoRagAnswer>('/rag/answer', {
      question,
      limit: 6,
      filters: { metadata },
    });
  }

  async semanticSearch(
    query: string,
    metadata: Record<string, string | number | boolean> = {},
  ) {
    this.assertConfigured();
    return this.postJson('/rag/search', {
      query,
      limit: 8,
      filters: { metadata },
    });
  }

  private assertConfigured() {
    if (!this.baseUrl || !this.apiKey) {
      throw new ServiceUnavailableException(
        'RKJO AI n’est pas encore configuré. Définir RKJO_AI_BASE_URL et RKJO_AI_API_KEY.',
      );
    }
  }

  private async postJson<T = unknown>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });
    } catch (cause) {
      throw new BadGatewayException('RKJO AI est injoignable');
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new BadGatewayException(
        `RKJO AI a retourné ${response.status}${detail ? ` : ${detail.slice(0, 300)}` : ''}`,
      );
    }

    return (await response.json()) as T;
  }
}
