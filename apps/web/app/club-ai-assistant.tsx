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

type ResolveResponse = { query: string; match: Candidate | null; alternatives: Candidate[]; ambiguous: boolean };
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
type ChecklistItem = {
  code: string;
  label: string;
  type: string;
  required: boolean;
  condition?: string;
  present: boolean;
  documentId?: string | null;
  status?: string | null;
};
type Checklist = {
  registrationId: string;
  totalRequired: number;
  completedRequired: number;
  complete: boolean;
  items: ChecklistItem[];
};
type AssistantAnswer = {
  title: string;
  summary: string;
  missing: ChecklistItem[];
  present: ChecklistItem[];
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
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { message?: string }).message ?? `Erreur ${response.status}`);
  return data as T;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function wantsDossierAnswer(value: string) {
  const text = normalize(value);
  return ['piece', 'pieces', 'dossier', 'licence', 'complet', 'complete', 'conforme', 'manque', 'manquante', 'manquantes', 'certificat medical'].some((term) => text.includes(term));
}

export function ClubAiAssistant({ token, organizationId }: { token: string; organizationId: string }) {
  const [query, setQuery] = useState('');
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolved, setResolved] = useState<ResolveResponse | null>(null);
  const [player, setPlayer] = useState<PlayerDetails | null>(null);
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);

  const speechSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    return Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition);
  }, []);

  async function loadDossierAnswer(registrationId: string, text: string) {
    if (!wantsDossierAnswer(text)) {
      setAnswer(null);
      return;
    }
    const checklist = await apiRequest<Checklist>(`/license-documents/${registrationId}/checklist`, token);
    const missing = checklist.items.filter((item) => item.required && !item.present);
    const present = checklist.items.filter((item) => item.present);
    setAnswer({
      title: checklist.complete ? 'Dossier obligatoire complet' : 'Dossier à compléter',
      summary: checklist.complete
        ? `${checklist.completedRequired}/${checklist.totalRequired} pièces obligatoires sont déposées.`
        : `${checklist.completedRequired}/${checklist.totalRequired} pièces obligatoires sont déposées. Il manque ${missing.length} pièce(s) obligatoire(s).`,
      missing,
      present,
    });
  }

  async function openPlayer(registrationId: string, text = query) {
    const details = await apiRequest<PlayerDetails>(`/registries/players/${registrationId}`, token);
    setPlayer(details);
    await loadDossierAnswer(registrationId, text);
  }

  async function resolvePlayer(text: string) {
    const value = text.trim();
    if (!value) return;
    setLoading(true); setError(''); setPlayer(null); setAnswer(null);
    try {
      const result = await apiRequest<ResolveResponse>(`/ai-assistant/players/resolve?organizationId=${encodeURIComponent(organizationId)}&q=${encodeURIComponent(value)}`, token);
      setResolved(result);
      if (result.match) await openPlayer(result.match.registrationId, value);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Recherche impossible');
    } finally { setLoading(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void resolvePlayer(query); }

  function startVoice() {
    if (!speechSupported || listening) return;
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Constructor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Constructor) return;
    const recognition = new Constructor();
    recognition.lang = 'fr-FR'; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1]?.[0]?.transcript?.trim() ?? '';
      if (transcript) { setQuery(transcript); void resolvePlayer(transcript); }
    };
    recognition.onerror = () => { setListening(false); setError('Reconnaissance vocale interrompue. Vous pouvez saisir la demande au clavier.'); };
    recognition.onend = () => setListening(false);
    setListening(true); recognition.start();
  }

  async function selectCandidate(candidate: Candidate) {
    setLoading(true); setError(''); setAnswer(null);
    try {
      await openPlayer(candidate.registrationId, query);
      setResolved((current) => current ? { ...current, match: candidate, ambiguous: false } : current);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ouverture de la fiche impossible'); }
    finally { setLoading(false); }
  }

  const initials = player ? `${player.person.firstName[0] ?? ''}${player.person.lastName[0] ?? ''}`.toUpperCase() : '';

  return (
    <section className="data-panel">
      <div className="workspace-actions"><div><h2>Assistant IA du club</h2><p>Essayez « Ouvre la fiche de Cédric Dossou » ou « Quelles pièces manquent à Cédric Dossou ? ».</p></div></div>
      <form className="entity-form" onSubmit={submit}>
        <label>Demande<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex. Quelles pièces manquent à Cédric Dossou ?" autoComplete="off" /></label>
        <div className="workspace-actions">
          <button type="submit" disabled={loading}>{loading ? 'Analyse…' : 'Rechercher'}</button>
          <button type="button" onClick={startVoice} disabled={!speechSupported || listening}>{listening ? '🎙 Écoute…' : '🎤 Parler'}</button>
        </div>
      </form>
      {!speechSupported && <p className="api-error">La reconnaissance vocale n’est pas disponible dans ce navigateur. La recherche texte reste active.</p>}
      {error && <div className="api-error">{error}</div>}
      {resolved && !resolved.match && resolved.alternatives.length === 0 && <p>Aucun joueur suffisamment proche de « {resolved.query} ».</p>}
      {resolved?.ambiguous && <div><h3>Plusieurs joueurs correspondent</h3><p>Choisissez le bon joueur avant d’ouvrir la fiche.</p><div className="workspace-actions">{resolved.alternatives.map((candidate) => <button key={candidate.registrationId} type="button" onClick={() => void selectCandidate(candidate)}>{candidate.fullName} · {Math.round(candidate.score * 100)} %</button>)}</div></div>}

      {answer && (
        <div className="data-panel" style={{ marginTop: 18 }}>
          <label>RÉPONSE ASSISTANT</label>
          <h3>{answer.title}</h3>
          <p>{answer.summary}</p>
          {answer.missing.length > 0 && <div style={{ marginTop: 12 }}><strong>Pièces obligatoires manquantes</strong><ul>{answer.missing.map((item) => <li key={item.code}>{item.label}</li>)}</ul></div>}
          {answer.missing.length === 0 && <p style={{ marginTop: 12 }}>Aucune pièce obligatoire manquante selon la checklist actuelle.</p>}
          <p style={{ marginTop: 12, fontSize: 12 }}>Cette réponse décrit l’état du dossier. Elle ne remplace pas la validation réglementaire humaine LFPB/FBF.</p>
        </div>
      )}

      {player && (
        <div className="data-panel">
          <div className="workspace-actions">
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              {player.person.photoDataUrl ? (
                <img src={player.person.photoDataUrl} alt={`Photo de ${player.person.firstName} ${player.person.lastName}`} width={132} height={132} style={{ borderRadius: 18, objectFit: 'cover', border: '3px solid rgba(212,169,59,.65)' }} />
              ) : (
                <div aria-label="Photo non renseignée" style={{ width: 132, height: 132, borderRadius: 18, display: 'grid', placeItems: 'center', background: '#e9edf2', color: '#0b3555', fontSize: 36, fontWeight: 800 }}>{initials}</div>
              )}
              <div><label>FICHE JOUEUR</label><h3>{player.person.firstName} {player.person.lastName}</h3><p>{player.person.photoDataUrl ? 'Identité visuelle enregistrée' : 'Photo non renseignée dans la fiche joueur'}</p></div>
            </div>
          </div>
          <div className="table-wrap"><table><tbody>
            <tr><th>Statut</th><td>{player.status}</td></tr>
            <tr><th>Naissance</th><td>{player.person.birthDate ? new Date(player.person.birthDate).toLocaleDateString('fr-FR') : '—'}</td></tr>
            <tr><th>Nationalité</th><td>{player.person.nationality ?? '—'}</td></tr>
            <tr><th>Identifiant fédéral</th><td>{player.person.federationId ?? '—'}</td></tr>
            <tr><th>Poste</th><td>{player.playerProfile?.position ?? '—'}</td></tr>
            <tr><th>Numéro</th><td>{player.playerProfile?.shirtNumber ?? '—'}</td></tr>
            <tr><th>Licences</th><td>{player.licenses?.length ?? 0}</td></tr>
            <tr><th>Pièces du dossier</th><td>{player.documents?.length ?? 0}</td></tr>
          </tbody></table></div>
        </div>
      )}
    </section>
  );
}
