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
type Venue = { id: string; name: string; city: string; approved: boolean; active: boolean; capacity?: number | null };
type Round = { id: string; number: number; startDate?: string | null; matches?: unknown[] };
type ProgrammingWindow = { validFrom: string; validUntil: string; weekdays: number[]; startTime: string; endTime: string };
type MaterializationResult = { roundsCreated: number; matchesCreated: number; firstKickoffAt?: string | null; lastKickoffAt?: string | null };

type Props = { token: string; role: string };

const weekdayLabels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

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

function defaultWindow(): ProgrammingWindow {
  const today = new Date();
  const end = new Date(today);
  end.setMonth(end.getMonth() + 6);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return { validFrom: iso(today), validUntil: iso(end), weekdays: [6, 0], startTime: '14:00', endTime: '20:00' };
}

export function LeagueCompetitionCalendar({ token, role }: Props) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionId, setCompetitionId] = useState('');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [roundRecords, setRoundRecords] = useState<Round[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [rules, setRules] = useState({ minRestHours: 72, maxConsecutiveHome: 2, maxConsecutiveAway: 2 });
  const [windows, setWindows] = useState<ProgrammingWindow[]>([defaultWindow()]);
  const [authorizedVenueIds, setAuthorizedVenueIds] = useState<string[]>([]);

  const selected = useMemo(() => competitions.find((item) => item.id === competitionId), [competitions, competitionId]);
  const latest = proposals[0];
  const rounds = preview?.rounds ?? latest?.payload?.rounds ?? [];
  const qualityScore = preview?.quality.score ?? latest?.qualityScore ?? null;
  const activeClubs = selected?.entries?.filter((entry) => entry.active !== false) ?? [];
  const approvedVenues = venues.filter((venue) => venue.active && venue.approved);
  const isMaterialized = roundRecords.length > 0;

  async function loadCompetitions() {
    const items = await api<Competition[]>('/competitions', token);
    setCompetitions(items);
    setCompetitionId((current) => current || items[0]?.id || '');
  }

  async function loadVenues() {
    const items = await api<Venue[]>('/venues', token);
    setVenues(items);
    setAuthorizedVenueIds((current) => current.length ? current : items.filter((venue) => venue.active && venue.approved).map((venue) => venue.id));
  }

  async function loadCompetition(id: string) {
    if (!id) return;
    setError('');
    const plans = await api<Proposal[]>(`/competitions/${id}/schedule-proposals`, token).catch(() => []);
    const materializedRounds = await api<Round[]>(`/competitions/${id}/rounds`, token).catch(() => []);
    setProposals(plans);
    setRoundRecords(materializedRounds);
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

  useEffect(() => {
    void Promise.all([loadCompetitions(), loadVenues()]).catch((reason) => setError(reason instanceof Error ? reason.message : 'Chargement impossible'));
  }, [token]);
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

  function materialize() {
    if (!latest) return;
    if (!authorizedVenueIds.length) { setError('Sélectionnez au moins un stade autorisé.'); return; }
    if (windows.some((windowItem) => !windowItem.validFrom || !windowItem.validUntil || !windowItem.weekdays.length || !windowItem.startTime || !windowItem.endTime)) {
      setError('Chaque fenêtre doit contenir une période, au moins un jour et une plage horaire.'); return;
    }
    return run(async () => {
      const result = await api<MaterializationResult>(`/schedule-proposals/${latest.id}/materialize`, token, {
        method: 'POST',
        body: JSON.stringify({ programmingWindows: windows, authorizedVenueIds }),
      });
      setNotice(`${result.roundsCreated} journée(s) et ${result.matchesCreated} rencontre(s) matérialisées.`);
    }, 'Calendrier opérationnel matérialisé.');
  }

  function publish() {
    if (!latest) return;
    return run(() => api(`/schedule-proposals/${latest.id}/publish`, token, { method: 'PATCH' }), 'Calendrier publié par la Ligue.');
  }

  function addWindow() { setWindows((current) => [...current, defaultWindow()]); }
  function removeWindow(index: number) { setWindows((current) => current.filter((_, itemIndex) => itemIndex !== index)); }
  function updateWindow(index: number, patch: Partial<ProgrammingWindow>) { setWindows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)); }
  function toggleWeekday(index: number, day: number) {
    const current = windows[index];
    const weekdays = current.weekdays.includes(day) ? current.weekdays.filter((value) => value !== day) : [...current.weekdays, day].sort();
    updateWindow(index, { weekdays });
  }
  function toggleVenue(id: string) {
    setAuthorizedVenueIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  return (
    <section className="calendar-cockpit">
      <div className="calendar-hero">
        <div><span className="calendar-kicker">PLANIFICATION ASSISTÉE PAR DIGITAL FOOT</span><h2>Calendrier des compétitions</h2><p>Digital Foot prépare, contrôle et matérialise la proposition. La Ligue garde la décision et la publication.</p></div>
        <div className="calendar-ai-badge"><b>IA</b><span>Optimisation & contrôle</span></div>
      </div>

      {error && <div className="calendar-message error">{error}</div>}
      {notice && <div className="calendar-message success">{notice}</div>}

      <div className="calendar-flow" aria-label="Parcours de planification">
        {['Compétition', 'Clubs engagés', 'Contraintes', 'Proposition optimisée', 'Fenêtres & stades', 'Validation humaine', 'Publication'].map((label, index) => <div key={label} className="calendar-flow-step"><b>{index + 1}</b><span>{label}</span></div>)}
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
        {(role === 'COMPETITION_MANAGER' || role === 'LIGUE_ADMIN') && <button className="calendar-primary" disabled={busy || activeClubs.length < 2 || isMaterialized} onClick={generate}>{busy ? 'Traitement…' : '✦ Générer une proposition optimisée'}</button>}
        {latest && <div className="calendar-proposal-status"><span>Version {latest.version}</span><b>{statusLabel[latest.status] ?? latest.status}</b>{latest.rejectionReason && <em>{latest.rejectionReason}</em>}{isMaterialized && <strong>Calendrier opérationnel créé</strong>}</div>}
        {rounds.length > 0 ? <div className="calendar-rounds">{rounds.slice(0, 6).map((round) => <div className="calendar-round" key={round.number}><h4>Journée {round.number}</h4>{round.matches.map((match, index) => <div className="calendar-fixture" key={`${round.number}-${index}`}><span>{match.homeClub.name}</span><b>—</b><span>{match.awayClub.name}</span></div>)}{round.byeClub?.name && <small>Exempt : {round.byeClub.name}</small>}</div>)}</div> : <div className="calendar-empty">La proposition apparaîtra ici après génération.</div>}
      </article>

      {role === 'LIGUE_ADMIN' && latest?.status === 'APPROVED' && !isMaterialized && <article className="calendar-card">
        <div className="calendar-card-title"><div><small>04 · PROGRAMMATION</small><h3>Fenêtres de programmation et stades autorisés</h3></div><span className="calendar-count">CDC</span></div>
        <p className="calendar-note">La Ligue définit les fenêtres autorisées. Digital Foot recherche ensuite un créneau valide sans conflit de club, de stade ni de repos.</p>
        <div className="calendar-window-list">
          {windows.map((windowItem, index) => <div className="calendar-window" key={index}>
            <div className="calendar-window-head"><b>Fenêtre {index + 1}</b>{windows.length > 1 && <button type="button" className="calendar-link" onClick={() => removeWindow(index)}>Supprimer</button>}</div>
            <div className="calendar-window-grid">
              <label className="calendar-field">Du<input type="date" value={windowItem.validFrom} onChange={(event) => updateWindow(index, { validFrom: event.target.value })} /></label>
              <label className="calendar-field">Au<input type="date" value={windowItem.validUntil} onChange={(event) => updateWindow(index, { validUntil: event.target.value })} /></label>
              <label className="calendar-field">Début<input type="time" value={windowItem.startTime} onChange={(event) => updateWindow(index, { startTime: event.target.value })} /></label>
              <label className="calendar-field">Fin<input type="time" value={windowItem.endTime} onChange={(event) => updateWindow(index, { endTime: event.target.value })} /></label>
            </div>
            <div className="calendar-weekdays">{weekdayLabels.map((label, day) => <button type="button" key={label} className={windowItem.weekdays.includes(day) ? 'active' : ''} onClick={() => toggleWeekday(index, day)}>{label}</button>)}</div>
          </div>)}
        </div>
        <button type="button" className="calendar-secondary" onClick={addWindow}>+ Ajouter une fenêtre</button>

        <div className="calendar-venue-section">
          <b>Stades autorisés pour cette programmation</b>
          {approvedVenues.length === 0 ? <div className="calendar-empty">Aucun stade actif et homologué disponible.</div> : <div className="calendar-venue-grid">{approvedVenues.map((venue) => <label key={venue.id} className={`calendar-venue ${authorizedVenueIds.includes(venue.id) ? 'selected' : ''}`}><input type="checkbox" checked={authorizedVenueIds.includes(venue.id)} onChange={() => toggleVenue(venue.id)} /><span><strong>{venue.name}</strong><small>{venue.city}{venue.capacity ? ` · ${venue.capacity} places` : ''}</small></span></label>)}</div>}
        </div>
        <button className="calendar-primary" disabled={busy || !authorizedVenueIds.length} onClick={materialize}>{busy ? 'Contrôle et matérialisation…' : 'Créer les journées et rencontres'}</button>
      </article>}

      <article className="calendar-card calendar-governance">
        <div className="calendar-card-title"><div><small>05 · GOUVERNANCE</small><h3>Validation humaine et publication</h3></div></div>
        <div className="calendar-governance-flow"><span>Digital Foot <b>propose</b></span><i>→</i><span>Responsable <b>soumet</b></span><i>→</i><span>Validateur <b>approuve</b></span><i>→</i><span>Ligue <b>matérialise et publie</b></span></div>
        <div className="calendar-actions">
          {(role === 'COMPETITION_MANAGER' || role === 'LIGUE_ADMIN') && latest?.status === 'GENERATED' && <button className="calendar-primary" disabled={busy} onClick={submit}>Soumettre pour validation</button>}
          {role === 'SCHEDULE_APPROVER' && latest?.status === 'SUBMITTED' && <><button className="calendar-primary" disabled={busy} onClick={() => decide('APPROVED')}>Approuver</button><button className="calendar-danger" disabled={busy} onClick={() => decide('REJECTED')}>Rejeter</button></>}
          {role === 'LIGUE_ADMIN' && latest?.status === 'APPROVED' && isMaterialized && <button className="calendar-primary" disabled={busy} onClick={publish}>Publier le calendrier</button>}
          {role === 'LIGUE_ADMIN' && latest?.status === 'APPROVED' && !isMaterialized && <span className="calendar-muted">Matérialisez d’abord les journées et rencontres avant publication.</span>}
          {!latest && <span className="calendar-muted">Générez d’abord une proposition.</span>}
        </div>
        <p className="calendar-note">L’assistance numérique ne publie jamais seule : toute publication reste une décision de la Ligue.</p>
      </article>
    </section>
  );
}
