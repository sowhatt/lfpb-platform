'use client';

import { FormEvent, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type Candidate = {
  registrationId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  nationality?: string | null;
  position?: string | null;
  shirtNumber?: number | null;
  score: number;
};

type ResolveResponse = {
  query: string;
  match: Candidate | null;
  alternatives: Candidate[];
  ambiguous: boolean;
};

type PlayerDetails = {
  id: string;
  status: string;
  person: {
    firstName: string;
    lastName: string;
    birthDate?: string;
    nationality?: string | null;
    federationId?: string | null;
    photoDataUrl?: string | null;
  };
  playerProfile?: { position?: string; shirtNumber?: number | null } | null;
  licenses?: Array<{ id: string; number?: string | null; season: string; status: string }>;
  documents?: Array<{ id: string; type: string; status: string }>;
};

type SpeechRecognitionResultLike = { 0: { transcript: string }; isFinal: boolean };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

async function apiRequest<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { message?: string }).message ?? `Erreur ${response.status}`);
  }
  return data as T;
}

export function ClubAiAssistant({
  token,
  organizationId,
}: {
  token: string;
  organizationId: string;
}) {
  const [query, setQuery] = useState('');
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolved, setResolved] = useState<ResolveResponse | null>(null);
  const [player, setPlayer] = useState<PlayerDetails | null>(null);

  const speechSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition);
  }, []);

  async function resolvePlayer(text: string) {
    const value = text.trim();
    if (!value) return;
    setLoading(true);
    setError('');
    setPlayer(null);
    try {
      const result = await apiRequest<ResolveResponse>(
        `/ai-assistant/players/resolve?organizationId=${encodeURIComponent(organizationId)}&q=${encodeURIComponent(value)}`,
        token,
      );
      setResolved(result);
      if (result.match) {
        const details = await apiRequest<PlayerDetails>(
          `/registries/players/${result.match.registrationId}`,
          token,
        );
        setPlayer(details);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Recherche impossible');
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void resolvePlayer(query);
  }

  function startVoice() {
    if (!speechSupported || listening) return;
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Constructor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Constructor) return;

    const recognition = new Constructor();
    recognition.lang = 'fr-FR';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const transcript = last?.[0]?.transcript?.trim() ?? '';
      if (transcript) {
        setQuery(transcript);
        void resolvePlayer(transcript);
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setError('Reconnaissance vocale interrompue. Vous pouvez saisir le nom au clavier.');
    };
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  async function selectCandidate(candidate: Candidate) {
    setLoading(true);
    setError('');
    try {
      const details = await apiRequest<PlayerDetails>(`/registries/players/${candidate.registrationId}`, token);
      setPlayer(details);
      setResolved((current) => current ? { ...current, match: candidate, ambiguous: false } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ouverture de la fiche impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="data-panel">
      <div className="workspace-actions">
        <div>
          <h2>Assistant IA du club</h2>
          <p>Dites « Ouvre la fiche de Cédric Dossou » ou saisissez directement un nom.</p>
        </div>
      </div>

      <form className="entity-form" onSubmit={submit}>
        <label>
          Recherche joueur
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex. Ouvre la fiche de Cédric Dossou"
            autoComplete="off"
          />
        </label>
        <div className="workspace-actions">
          <button type="submit" disabled={loading}>{loading ? 'Recherche…' : 'Rechercher'}</button>
          <button type="button" onClick={startVoice} disabled={!speechSupported || listening}>
            {listening ? '🎙 Écoute…' : '🎤 Parler'}
          </button>
        </div>
      </form>

      {!speechSupported && (
        <p className="api-error">La reconnaissance vocale n’est pas disponible dans ce navigateur. La recherche texte reste active.</p>
      )}
      {error && <div className="api-error">{error}</div>}

      {resolved && !resolved.match && resolved.alternatives.length === 0 && (
        <p>Aucun joueur suffisamment proche de « {resolved.query} ».</p>
      )}

      {resolved?.ambiguous && (
        <div>
          <h3>Plusieurs joueurs correspondent</h3>
          <p>Choisissez le bon joueur avant d’ouvrir la fiche.</p>
          <div className="workspace-actions">
            {resolved.alternatives.map((candidate) => (
              <button key={candidate.registrationId} type="button" onClick={() => void selectCandidate(candidate)}>
                {candidate.fullName} · {Math.round(candidate.score * 100)} %
              </button>
            ))}
          </div>
        </div>
      )}

      {player && (
        <div className="data-panel">
          <div className="workspace-actions">
            <div>
              <h3>{player.person.firstName} {player.person.lastName}</h3>
              <p>Fiche joueur résolue par l’assistant IA</p>
            </div>
            {player.person.photoDataUrl && (
              <img src={player.person.photoDataUrl} alt="Photo du joueur" width={72} height={72} style={{ borderRadius: '50%', objectFit: 'cover' }} />
            )}
          </div>
          <div className="table-wrap">
            <table>
              <tbody>
                <tr><th>Statut</th><td>{player.status}</td></tr>
                <tr><th>Naissance</th><td>{player.person.birthDate ? new Date(player.person.birthDate).toLocaleDateString('fr-FR') : '—'}</td></tr>
                <tr><th>Nationalité</th><td>{player.person.nationality ?? '—'}</td></tr>
                <tr><th>Poste</th><td>{player.playerProfile?.position ?? '—'}</td></tr>
                <tr><th>Numéro</th><td>{player.playerProfile?.shirtNumber ?? '—'}</td></tr>
                <tr><th>Licences</th><td>{player.licenses?.length ?? 0}</td></tr>
                <tr><th>Pièces du dossier</th><td>{player.documents?.length ?? 0}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
