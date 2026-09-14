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
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { message?: string }).message ?? `Erreur ${response.status}`);
  return payload as T;
}

const statusLabel: Record<string, string> = {
  ISSUED_BY_FBF: 'Délivrée par la FBF',
  APPROVED_BY_LEAGUE: 'Validée par la Ligue',
  PENDING_FBF: 'En attente FBF',
  REJECTED: 'Rejetée',
};

export function OfficialMatchPlayerControl({ token, matchId }: { token: string; matchId: string }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ResolveResponse | null>(null);
  const [selected, setSelected] = useState<MatchPlayer | null>(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');

  const speechSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    return Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition);
  }, []);

  async function resolve(text: string) {
    const value = text.trim();
    if (!value) return;
    setLoading(true); setError(''); setSelected(null);
    try {
      const response = await apiRequest<ResolveResponse>(`/official-match-access/${encodeURIComponent(matchId)}/players/resolve?q=${encodeURIComponent(value)}`, token);
      setResult(response);
      if (response.match) setSelected(response.match);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Recherche impossible');
    } finally { setLoading(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void resolve(query); }

  function startVoice() {
    if (!speechSupported || listening) return;
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Constructor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Constructor) return;
    const recognition = new Constructor();
    recognition.lang = 'fr-FR'; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1]?.[0]?.transcript?.trim() ?? '';
      if (transcript) { setQuery(transcript); void resolve(transcript); }
    };
    recognition.onerror = () => { setListening(false); setError('Reconnaissance vocale interrompue.'); };
    recognition.onend = () => setListening(false);
    setListening(true); recognition.start();
  }

  const initials = selected ? `${selected.firstName?.[0] ?? ''}${selected.lastName?.[0] ?? ''}` : '';
  const eligible = selected?.eligibility === 'ELIGIBLE';

  return (
    <section className="data-panel" style={{ padding: 20 }}>
      <div style={{ padding: '20px 22px', borderRadius: 14, background: '#0b2c48', color: '#fff' }}>
        <label style={{ color: '#dfba54', fontSize: 9, fontWeight: 900, letterSpacing: '.13em' }}>MATCH CONNECTÉ · CONTRÔLE D’IDENTITÉ</label>
        <h2 style={{ margin: '7px 0 4px', fontSize: 24 }}>Vérifier un joueur</h2>
        <p style={{ margin: 0, color: '#b8c6d1', fontSize: 11 }}>Recherche limitée aux joueurs des deux équipes de cette rencontre.</p>
      </div>

      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) auto auto', gap: 10, alignItems: 'end', padding: 16, marginTop: 14, border: '1px solid #e2e7ea', borderRadius: 12, background: '#fff' }}>
        <label style={{ display: 'grid', gap: 7, color: '#596879', fontSize: 10, fontWeight: 800 }}>
          Nom du joueur
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex. Cédric Dossou" autoComplete="off" style={{ width: '100%', padding: '11px 12px', border: '1px solid #dce3e7', borderRadius: 8, fontSize: 13 }} />
        </label>
        <button type="submit" disabled={loading} style={{ padding: '11px 16px', border: 0, borderRadius: 8, background: '#d7af47', color: '#102a43', fontWeight: 900 }}>{loading ? 'Recherche…' : 'Rechercher'}</button>
        <button type="button" onClick={startVoice} disabled={!speechSupported || listening} style={{ padding: '11px 16px', border: 0, borderRadius: 8, background: '#0d3150', color: '#fff', fontWeight: 900 }}>{listening ? '🎙 Écoute…' : '🎤 Parler'}</button>
      </form>

      {error && <div className="api-error">{error}</div>}

      {result?.ambiguous && <div style={{ marginTop: 14 }}><strong>Plusieurs joueurs correspondent</strong><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>{result.alternatives.map((candidate) => <button key={candidate.registrationId} type="button" onClick={() => setSelected(candidate)} style={{ padding: '9px 12px', border: '1px solid #dce3e7', borderRadius: 8, background: '#fff' }}>{candidate.fullName} · {candidate.club.name}</button>)}</div></div>}

      {selected && (
        <section style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 22, padding: 20, marginTop: 18, border: '1px solid #e2e7ea', borderRadius: 14, background: '#fff', boxShadow: '0 8px 24px #1c2e4309' }}>
          <div>
            <div style={{ width: 112, height: 132, borderRadius: 12, overflow: 'hidden', display: 'grid', placeItems: 'center', background: '#e8edf2', color: '#0b2c48', fontSize: 32, fontWeight: 900 }}>
              {selected.photoDataUrl ? <img src={selected.photoDataUrl} alt={selected.fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>{initials}</span>}
            </div>
            <div style={{ marginTop: 9, padding: '7px 9px', borderRadius: 8, background: eligible ? '#e7f4ec' : '#fbf1d9', color: eligible ? '#27704d' : '#916b18', fontSize: 10, fontWeight: 900, textAlign: 'center' }}>{eligible ? '✓ ÉLIGIBLE' : '⚠ À CONTRÔLER'}</div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <span style={{ color: '#a37c22', fontSize: 9, fontWeight: 900, letterSpacing: '.1em' }}>{selected.club.name}</span>
                <h2 style={{ margin: '5px 0 3px', fontSize: 26 }}>{selected.fullName}</h2>
                <p style={{ margin: 0, color: '#748191', fontSize: 12 }}>{selected.position ?? 'Joueur'}{selected.shirtNumber ? ` · N° ${selected.shirtNumber}` : ''}</p>
              </div>
              {selected.shirtNumber != null && <div style={{ minWidth: 58, padding: '10px 12px', borderRadius: 10, background: '#0b2c48', color: '#fff', textAlign: 'center', fontSize: 22, fontWeight: 900 }}>#{selected.shirtNumber}</div>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginTop: 18 }}>
              {[
                ['Date de naissance', selected.birthDate ? new Date(selected.birthDate).toLocaleDateString('fr-FR') : '—'],
                ['Identifiant fédéral', selected.federationId ?? '—'],
                ['Licence', selected.license?.number ?? '—'],
                ['Statut licence', selected.license?.status ? (statusLabel[selected.license.status] ?? selected.license.status) : 'Aucune licence'],
              ].map(([label, value]) => <div key={label} style={{ padding: 12, borderRadius: 10, background: '#f7f9fa' }}><span style={{ display: 'block', color: '#84909e', fontSize: 9, fontWeight: 800, textTransform: 'uppercase' }}>{label}</span><strong style={{ display: 'block', marginTop: 5, color: '#203147', fontSize: 12 }}>{value}</strong></div>)}
            </div>
          </div>
        </section>
      )}

      <p style={{ margin: '12px 4px 0', color: '#8a96a2', fontSize: 10 }}>Le contrôle numérique assiste l’officiel ; la décision finale reste humaine. Les pièces administratives sensibles ne sont pas affichées.</p>
    </section>
  );
}
