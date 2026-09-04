'use client';

import { FormEvent, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type MatchPlayer = {
  registrationId: string;
  club: { organizationId: string; name: string };
  fullName: string;
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  federationId?: string | null;
  photoDataUrl?: string | null;
  position?: string | null;
  shirtNumber?: number | null;
  registrationStatus: string;
  license?: { number?: string | null; season: string; status: string } | null;
  eligibility: 'ELIGIBLE' | 'CHECK_REQUIRED';
  score?: number;
};

type ResolveResponse = {
  matchContext: {
    id: string;
    season: string;
    competition: string;
    homeClub: { id: string; name: string };
    awayClub: { id: string; name: string };
  };
  query: string;
  match: MatchPlayer | null;
  alternatives: MatchPlayer[];
  ambiguous: boolean;
};

type SpeechRecognitionResultLike = { 0: { transcript: string } };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

async function apiRequest<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { message?: string }).message ?? `Erreur ${response.status}`);
  }
  return payload as T;
}

export function OfficialMatchPlayerControl({ token, matchId }: { token: string; matchId: string }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ResolveResponse | null>(null);
  const [selected, setSelected] = useState<MatchPlayer | null>(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');

  const speechSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition);
  }, []);

  async function resolve(text: string) {
    const value = text.trim();
    if (!value) return;
    setLoading(true);
    setError('');
    setSelected(null);
    try {
      const response = await apiRequest<ResolveResponse>(
        `/official-match-access/${encodeURIComponent(matchId)}/players/resolve?q=${encodeURIComponent(value)}`,
        token,
      );
      setResult(response);
      if (response.match) setSelected(response.match);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Recherche impossible');
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void resolve(query);
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
      const transcript = event.results[event.results.length - 1]?.[0]?.transcript?.trim() ?? '';
      if (transcript) {
        setQuery(transcript);
        void resolve(transcript);
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setError('Reconnaissance vocale interrompue.');
    };
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  return (
    <section className="data-panel">
      <div className="workspace-actions">
        <div>
          <label>CONNECTED MATCH · CONTRÔLE IDENTITÉ</label>
          <h2>Vérifier un joueur du match</h2>
          <p>Recherche limitée aux deux équipes de la rencontre assignée à l’officiel.</p>
        </div>
      </div>

      <form className="entity-form" onSubmit={submit}>
        <label>
          Nom ou commande
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex. Vérifie Cédric Dossou"
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

      {error && <div className="api-error">{error}</div>}
      {result?.ambiguous && (
        <div>
          <h3>Plusieurs joueurs correspondent</h3>
          <div className="workspace-actions">
            {result.alternatives.map((candidate) => (
              <button key={candidate.registrationId} type="button" onClick={() => setSelected(candidate)}>
                {candidate.fullName} · {candidate.club.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <section className="player-profile">
          <div className="player-photo">
            {selected.photoDataUrl ? (
              <img src={selected.photoDataUrl} alt={`${selected.firstName} ${selected.lastName}`} />
            ) : (
              <span>{selected.firstName[0]}{selected.lastName[0]}</span>
            )}
          </div>
          <div className="player-identity">
            <label>{selected.club.name}</label>
            <h2>{selected.fullName}</h2>
            <dl>
              <div><dt>Date de naissance</dt><dd>{selected.birthDate ? new Date(selected.birthDate).toLocaleDateString('fr-FR') : '—'}</dd></div>
              <div><dt>N° maillot</dt><dd>{selected.shirtNumber ?? '—'}</dd></div>
              <div><dt>Identifiant fédéral</dt><dd>{selected.federationId ?? '—'}</dd></div>
              <div><dt>Licence</dt><dd>{selected.license?.number ?? '—'}</dd></div>
              <div><dt>Statut licence</dt><dd>{selected.license?.status ?? 'Aucune licence saison'}</dd></div>
              <div><dt>Éligibilité</dt><dd><strong>{selected.eligibility === 'ELIGIBLE' ? '✓ ÉLIGIBLE' : '⚠ CONTRÔLE REQUIS'}</strong></dd></div>
            </dl>
          </div>
        </section>
      )}

      <div className="draft-warning">
        La photo et le statut assistent le contrôle. L’officiel conserve la décision humaine finale. Les pièces administratives sensibles ne sont pas affichées.
      </div>
    </section>
  );
}
