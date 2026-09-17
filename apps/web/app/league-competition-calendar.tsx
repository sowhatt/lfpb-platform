'use client';

import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type ClubEntry = { active?: boolean; club: { id: string; shortName: string; organization?: { name?: string } } };
type Competition = {
  id: string;
  name: string;
  code: string;
  format: string;
  status: string;
  minRestHours?: number;
  maxConsecutiveHome?: number;
  maxConsecutiveAway?: number;
  season?: { name: string };
  entries?: ClubEntry[];
};
type Quality = { score: number; [key: string]: unknown };
type Preview = {
  competition: { id: string; name: string; format: string };
  quality: Quality;
  constraints: string[];
  rounds: Array<{ number: number; byeClub?: { name?: string } | null; matches: Array<{ homeClub: { name?: string }; awayClub: { name?: string } }> }>;
};
type Proposal = {
  id: string;
  version: number;
  status: string;
  qualityScore: number;
  createdAt: string;
  rejectionReason?: string | null;
  qualityReport?: Quality;
  payload?: { constraints?: string[]; rounds?: Preview['rounds'] };
};

type Props = { token: string; role: string };

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { message?: string | string[] }).message;
    throw new Error(Array.isArray(message) ? message.join(' · ') : message ?? `Erreur ${response.status}`);
  }
  return data as T;
}

const statusLabel: Record<string, string> = {
  GENERATED: 'Proposition générée', SUBMITTED: 'En validation', APPROVED: 'Approuvée', REJECTED: 'Rejetée', PUBLISHED: 'Publiée',
};

export function LeagueCompetitionCalendar({ token, role }: Props) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionId, setCompetitionId] = useState('');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [rules, setRules] = useState({ minRestHours: 72, maxConsecutiveHome: 2, maxConsecutiveAway: 2 });

  const selected = useMemo(() => competitions.find((item) => item.id === competitionId), [competitions, competitionId]);
  const latest = proposals[0];
  const rounds = preview?.rounds ?? latest?.payload?.rounds ?? [];
  const qualityScore = preview?.quality.score ?? latest?.qualityScore ?? null;
  const activeClubs = selected?.entries?.filter((entry) => entry.active !== false) ?? [];

  async function loadCompetitions() {
    const items = await api<Competition[]>('/competitions', token);
    setCompetitions(items);
    setCompetitionId((current) => current || items[0]?.id || '');
  }

  async function loadCompetition(id: string) {
    if (!id) return;
    setError('');
    const plans = await api<Proposal[]>(`/competitions/${id}/schedule-proposals`, token).catch(() => []);
    setProposals(plans);
    if (role === 'LIGUE_ADMIN') {
      const result = await api<Preview>(`/competitions/${id}/fixture-plan/preview`, token).catch(() => null);
      setPreview(result);
    } else {
      setPreview(null);
    }
    const current = competitions.find((item) => item.id === id);
    if (current) setRules({
      minRestHours: current.minRestHours ?? 72,
      maxConsecutiveHome: current.maxConsecutiveHome ?? 2,
      maxConsecutiveAway: current.maxConsecutiveAway ?? 2,
    });
  }

  useEffect(() => { void loadCompetitions().catch((reason) => setError(reason instanceof Error ? reason.message : 'Chargement impossible')); }, [token]);
  useEffect(() => { if (competitionId) void loadCompetition(competitionId); }, [competitionId]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      setNotice(success);
      await loadCompetitions();
      await loadCompetition(competitionId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Action impossible');
    } finally { setBusy(false); }
  }

  function saveRules() {
    return run(() => api(`/competitions/${competitionId}/planning-rules`, token, { method: 'PATCH', body: JSON.stringify(rules) }), 'Contraintes de planification enregistrées.');
  }

  function generate() {
    return run(() => api(`/competitions/${competitionId}/schedule-proposals/generate`, token, { method: 'POST' }), 'Nouvelle proposition optimisée générée.');
  }

  function submit() {
    if (!latest) return;
    return run(() => api(`/schedule-proposals/${latest.id}/submit`, token, { method: 'PATCH' }), 'Proposition transmise pour validation humaine.');
  }

  function decide(decision: 'APPROVED' | 'REJECTED') {
    if (!latest) return;
    const reason = decision === 'REJECTED' ? window.prompt('Motif du rejet')?.trim() : undefined;
    if (decision === 'REJECTED' && !reason) return;
    return run(() => api(`/schedule-proposals/${latest.id}/decision`, token, { method: 'PATCH', body: JSON.stringify({ decision, reason }) }), decision === 'APPROVED' ? 'Proposition approuvée.' : 'Proposition rejetée.');
  }

  function publish() {
    if (!latest) return;
    return run(() => api(`/schedule-proposals/${latest.id}/publish`, token, { method: 'PATCH' }), 'Calendrier publié par la Ligue.');
  }

  return (
    <section className="calendar-cockpit">
      <div className="calendar-hero">
        <div><span className="calendar-kicker">PLANIFICATION ASSISTÉE PAR DIGITAL FOOT</span><h2>Calendrier des compétitions</h2><p>Digital Foot prépare et contrôle la proposition. La Ligue garde la décision et la publication.</p></div>
        <div className="calendar-ai-badge"><b>IA</b><span>Optimisation & contrôle</span></div>
      </div>

      {error && <div className="calendar-message error">{error}</div>}
      {notice && <div className="calendar-message success">{notice}</div>}

      <div className="calendar-flow" aria-label="Parcours de planification">
        {['Compétition', 'Clubs engagés', 'Contraintes', 'Proposition optimisée', 'Analyse qualité', 'Validation humaine', 'Publication'].map((label, index) => <div key={label} className="calendar-flow-step"><b>{index + 1}</b><span>{label}</span></div>)}
      </div>

      <div className="calendar-grid">
        <article className="calendar-card calendar-setup">
          <div className="calendar-card-title"><div><small>01 · CADRAGE</small><h3>Compétition et clubs engagés</h3></div><span className="calendar-count">{activeClubs.length} clubs</span></div>
          <label className="calendar-field">Compétition<select value={competitionId} onChange={(event) => setCompetitionId(event.target.value)}>{competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.name} · {competition.season?.name ?? 'Saison'}</option>)}</select></label>
          {selected ? <>
            <div className="calendar-meta"><span><small>Format</small><b>{selected.format.replaceAll('_', ' ')}</b></span><span><small>Statut</small><b>{selected.status}</b></span><span><small>Code</small><b>{selected.code}</b></span></div>
            <div className="calendar-clubs">{activeClubs.length ? activeClubs.map((entry) => <span key={entry.club.id}>✓ {entry.club.shortName}</span>) : <p>Aucun club engagé. Il faut au moins deux clubs avant de générer une proposition.</p>}</div>
          </> : <p>Aucune compétition disponible.</p>}
        </article>

        <article className="calendar-card">
          <div className="calendar-card-title"><div><small>02 · CONTRAINTES</small><h3>Règles de planification</h3></div></div>
          <div className="calendar-rules">
            <label className="calendar-field">Repos minimum (heures)<input type="number" min="24" max="168" value={rules.minRestHours} onChange={(event) => setRules({ ...rules, minRestHours: Number(event.target.value) })} /></label>
            <label className="calendar-field">Domiciles consécutifs max.<input type="number" min="1" max="10" value={rules.maxConsecutiveHome} onChange={(event) => setRules({ ...rules, maxConsecutiveHome: Number(event.target.value) })} /></label>
            <label className="calendar-field">Extérieurs consécutifs max.<input type="number" min="1" max="10" value={rules.maxConsecutiveAway} onChange={(event) => setRules({ ...rules, maxConsecutiveAway: Number(event.target.value) })} /></label>
          </div>
          {role === 'LIGUE_ADMIN' && <button className="calendar-secondary" disabled={busy || !competitionId} onClick={saveRules}>Enregistrer les contraintes</button>}
          <div className="calendar-constraint-list">{(preview?.constraints ?? latest?.payload?.constraints ?? []).map((constraint) => <span key={constraint}>✓ {constraint}</span>)}</div>
        </article>
      </div>

      <article className="calendar-card calendar-proposal">
        <div className="calendar-card-title"><div><small>03 · OPTIMISATION</small><h3>Proposition de calendrier</h3></div>{qualityScore !== null && <div className="calendar-score"><strong>{qualityScore}</strong><span>/100<br />qualité</span></div>}</div>
        <div className="calendar-intelligence"><b>Digital Foot analyse l’équilibre du championnat</b><span>Alternance domicile/extérieur, unicité des rencontres par journée, exemptions et contraintes définies par la Ligue.</span></div>
        {(role === 'COMPETITION_MANAGER' || role === 'LIGUE_ADMIN') && <button className="calendar-primary" disabled={busy || activeClubs.length < 2} onClick={generate}>{busy ? 'Traitement…' : '✦ Générer une proposition optimisée'}</button>}
        {latest && <div className="calendar-proposal-status"><span>Version {latest.version}</span><b>{statusLabel[latest.status] ?? latest.status}</b>{latest.rejectionReason && <em>{latest.rejectionReason}</em>}</div>}
        {rounds.length > 0 ? <div className="calendar-rounds">{rounds.slice(0, 6).map((round) => <div className="calendar-round" key={round.number}><h4>Journée {round.number}</h4>{round.matches.map((match, index) => <div className="calendar-fixture" key={`${round.number}-${index}`}><span>{match.homeClub.name}</span><b>—</b><span>{match.awayClub.name}</span></div>)}{round.byeClub?.name && <small>Exempt : {round.byeClub.name}</small>}</div>)}</div> : <div className="calendar-empty">La proposition apparaîtra ici après génération.</div>}
      </article>

      <article className="calendar-card calendar-governance">
        <div className="calendar-card-title"><div><small>04 · GOUVERNANCE</small><h3>Validation humaine et publication</h3></div></div>
        <div className="calendar-governance-flow"><span>Digital Foot <b>propose</b></span><i>→</i><span>Responsable <b>soumet</b></span><i>→</i><span>Validateur <b>approuve</b></span><i>→</i><span>Ligue <b>publie</b></span></div>
        <div className="calendar-actions">
          {(role === 'COMPETITION_MANAGER' || role === 'LIGUE_ADMIN') && latest?.status === 'GENERATED' && <button className="calendar-primary" disabled={busy} onClick={submit}>Soumettre pour validation</button>}
          {role === 'SCHEDULE_APPROVER' && latest?.status === 'SUBMITTED' && <><button className="calendar-primary" disabled={busy} onClick={() => decide('APPROVED')}>Approuver</button><button className="calendar-danger" disabled={busy} onClick={() => decide('REJECTED')}>Rejeter</button></>}
          {role === 'LIGUE_ADMIN' && latest?.status === 'APPROVED' && <button className="calendar-primary" disabled={busy} onClick={publish}>Publier le calendrier</button>}
          {!latest && <span className="calendar-muted">Générez d’abord une proposition.</span>}
        </div>
        <p className="calendar-note">L’assistance numérique ne publie jamais seule : toute publication reste une décision de la Ligue.</p>
      </article>
    </section>
  );
}
