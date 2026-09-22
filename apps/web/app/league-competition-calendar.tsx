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
type PreviewRound = { number: number; byeClub?: { name?: string } | null; matches: Array<{ homeClub: { name?: string }; awayClub: { name?: string } }> };
type Preview = { competition: { id: string; name: string; format: string }; quality: Quality; constraints: string[]; rounds: PreviewRound[] };
type Proposal = {
  id: string;
  version: number;
  status: string;
  qualityScore: number;
  createdAt: string;
  rejectionReason?: string | null;
  qualityReport?: Quality;
  payload?: { constraints?: string[]; rounds?: PreviewRound[] };
};
type Venue = { id: string; name: string; city: string; approved: boolean; active: boolean; capacity?: number | null };
type Round = { id: string; number: number; startDate?: string | null; matches?: unknown[] };
type MatchRecord = {
  id: string;
  kickoffAt?: string | null;
  status: string;
  postponementReason?: string | null;
  homeClub: { id: string; shortName: string };
  awayClub: { id: string; shortName: string };
  venue?: { id: string; name: string } | null;
  round?: { id: string; number: number } | null;
};

type MatchHistoryEntry = {
  id: string;
  action: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
  actor?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;
};
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
  GENERATED: 'Proposition générée',
  SUBMITTED: 'En validation',
  APPROVED: 'Approuvée',
  REJECTED: 'Rejetée',
  PUBLISHED: 'Publiée',
};

const matchStatusLabel: Record<string, string> = {
  DRAFT: 'Brouillon',
  SCHEDULED: 'Programmé',
  POSTPONED: 'Reporté',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminé',
  CANCELLED: 'Annulé',
};

const auditActionLabel: Record<string, string> = {
  MATCH_SCHEDULED: 'Match programmé',
  MATCH_RESCHEDULED: 'Match reprogrammé',
  MATCH_POSTPONED: 'Match reporté',
  MATCH_CANCELLED: 'Match annulé',
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
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [roundFilter, setRoundFilter] = useState('ALL');
  const [clubFilter, setClubFilter] = useState('ALL');
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [editKickoff, setEditKickoff] = useState('');
  const [editVenueId, setEditVenueId] = useState('');
  const [matchReason, setMatchReason] = useState('');
  const [matchHistory, setMatchHistory] = useState<MatchHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
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
  const expectedRoundCount = rounds.length;
  const expectedMatchCount = rounds.reduce((sum, round) => sum + round.matches.length, 0);
  const actualMatchCount = roundRecords.reduce((sum, round) => sum + (round.matches?.length ?? 0), 0);
  const scheduleMatchesProposal =
    expectedRoundCount > 0 &&
    roundRecords.length === expectedRoundCount &&
    actualMatchCount === expectedMatchCount;

  const isMaterialized =
    latest?.status === 'PUBLISHED' && scheduleMatchesProposal;

  const hasExistingCompetitionSchedule = roundRecords.length > 0;

  const filteredMatches = matches.filter((match) => {
    const roundMatches =
      roundFilter === 'ALL' || String(match.round?.number ?? '') === roundFilter;

    const clubMatches =
      clubFilter === 'ALL' ||
      match.homeClub.id === clubFilter ||
      match.awayClub.id === clubFilter;

    return roundMatches && clubMatches;
  });

  const toLocalDateTimeInput = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    const pad = (number: number) => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const selectedMatch = matches.find((match) => match.id === selectedMatchId) ?? null;

  async function openMatchManagement(match: MatchRecord) {
    setSelectedMatchId(match.id);
    setEditKickoff(toLocalDateTimeInput(match.kickoffAt));
    setEditVenueId(
      match.venue?.id ??
        approvedVenues.find((venue) => venue.name === match.venue?.name)?.id ??
        '',
    );
    setMatchReason('');
    setHistoryLoading(true);

    try {
      const history = await api<MatchHistoryEntry[]>(
        `/matches/${match.id}/history`,
        token,
      );
      setMatchHistory(history);
    } catch {
      setMatchHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshSelectedMatchHistory(matchId: string) {
    const history = await api<MatchHistoryEntry[]>(
      `/matches/${matchId}/history`,
      token,
    ).catch(() => []);
    setMatchHistory(history);
  }

  async function saveMatchSchedule() {
    if (!selectedMatch) return;

    if (!editKickoff) {
      setError('Sélectionnez une nouvelle date et heure.');
      return;
    }

    if (!editVenueId) {
      setError('Sélectionnez un stade.');
      return;
    }

    if (matchReason.trim().length < 3) {
      setError('Le motif de modification est obligatoire.');
      return;
    }

    await run(
      () =>
        api(`/matches/${selectedMatch.id}/schedule`, token, {
          method: 'PATCH',
          body: JSON.stringify({
            kickoffAt: new Date(editKickoff).toISOString(),
            venueId: editVenueId,
            reason: matchReason.trim(),
          }),
        }),
      'Match reprogrammé avec traçabilité.',
    );

    await refreshSelectedMatchHistory(selectedMatch.id);
    setMatchReason('');
  }

  async function changeSelectedMatchStatus(
    status: 'POSTPONED' | 'CANCELLED',
  ) {
    if (!selectedMatch) return;

    if (matchReason.trim().length < 3) {
      setError('Le motif est obligatoire.');
      return;
    }

    const label = status === 'POSTPONED' ? 'reporter' : 'annuler';

    if (
      !window.confirm(
        `Confirmer : ${label} ${selectedMatch.homeClub.shortName} - ${selectedMatch.awayClub.shortName} ?`,
      )
    ) {
      return;
    }

    await run(
      () =>
        api(`/matches/${selectedMatch.id}/status`, token, {
          method: 'PATCH',
          body: JSON.stringify({
            status,
            reason: matchReason.trim(),
          }),
        }),
      status === 'POSTPONED'
        ? 'Match reporté avec traçabilité.'
        : 'Match annulé avec traçabilité.',
    );

    await refreshSelectedMatchHistory(selectedMatch.id);
    setMatchReason('');
  }

  const formatKickoff = (value?: string | null) => {
    if (!value) return { date: 'Date à définir', time: '—' };
    const date = new Date(value);
    return {
      date: date.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      time: date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  };

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
    const [plans, materializedRounds, materializedMatches] = await Promise.all([
      api<Proposal[]>(`/competitions/${id}/schedule-proposals`, token).catch(() => []),
      api<Round[]>(`/competitions/${id}/rounds`, token).catch(() => []),
      api<MatchRecord[]>(`/competitions/${id}/matches`, token).catch(() => []),
    ]);
    setProposals(plans);
    setRoundRecords(materializedRounds);
    setMatches(materializedMatches);
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
    if (hasExistingCompetitionSchedule) { setError('Cette compétition contient déjà des journées ou rencontres. La matérialisation automatique est bloquée pour éviter tout écrasement.'); return; }
    if (!authorizedVenueIds.length) { setError('Sélectionnez au moins un stade autorisé.'); return; }
    if (windows.some((windowItem) => !windowItem.validFrom || !windowItem.validUntil || !windowItem.weekdays.length || !windowItem.startTime || !windowItem.endTime)) {
      setError('Chaque fenêtre doit contenir une période, au moins un jour et une plage horaire.'); return;
    }
    return run(() => api<MaterializationResult>(`/schedule-proposals/${latest.id}/materialize`, token, {
      method: 'POST',
      body: JSON.stringify({ programmingWindows: windows, authorizedVenueIds }),
    }), 'Proposition de calendrier matérialisée.');
  }

  function publish() {
    if (!latest) return;
    if (!isMaterialized) { setError('Publication bloquée : les journées et rencontres de cette proposition ne sont pas complètement matérialisées.'); return; }
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
        <div><span className="calendar-kicker">PLANIFICATION ASSISTÉE PAR DIGITAL FOOT</span><h2>Calendrier assisté par IA</h2><p>Digital Foot prépare, contrôle et matérialise la proposition. La Ligue garde la décision et la publication.</p></div>
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
        {(role === 'COMPETITION_MANAGER' || role === 'LIGUE_ADMIN') && (
          <button
            className="calendar-primary"
            disabled={busy || activeClubs.length < 2}
            onClick={generate}
          >
            {busy
              ? 'Traitement…'
              : hasExistingCompetitionSchedule
                ? '✦ Générer une nouvelle version'
                : '✦ Générer une proposition optimisée'}
          </button>
        )}
        {latest && <div className="calendar-proposal-status"><span>Version {latest.version}</span><b>{statusLabel[latest.status] ?? latest.status}</b>{latest.rejectionReason && <em>{latest.rejectionReason}</em>}{isMaterialized && <strong>Calendrier opérationnel créé</strong>}</div>}
        {rounds.length > 0 ? <div className="calendar-rounds">{rounds.slice(0, 6).map((round) => <div className="calendar-round" key={round.number}><h4>Journée {round.number}</h4>{round.matches.map((match, index) => <div className="calendar-fixture" key={`${round.number}-${index}`}><span>{match.homeClub.name}</span><b>—</b><span>{match.awayClub.name}</span></div>)}{round.byeClub?.name && <small>Exempt : {round.byeClub.name}</small>}</div>)}</div> : <div className="calendar-empty">La proposition apparaîtra ici après génération.</div>}
        {hasExistingCompetitionSchedule && !isMaterialized && (
          <div className="calendar-message">
            Un calendrier opérationnel existe déjà pour cette compétition. Cette nouvelle proposition n’a encore aucun effet sur le calendrier publié. Elle doit être validée par la Ligue avant tout remplacement.
          </div>
        )}
      </article>

      {role === 'LIGUE_ADMIN' && latest?.status === 'APPROVED' && !isMaterialized && !hasExistingCompetitionSchedule && <article className="calendar-card">
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

      {matches.length > 0 && <article className="calendar-card calendar-operational">
        <div className="calendar-card-title">
          <div>
            <small>04 · CALENDRIER OPÉRATIONNEL</small>
            <h3>Rencontres programmées</h3>
          </div>
          <span className="calendar-count">{filteredMatches.length} match{filteredMatches.length > 1 ? 's' : ''}</span>
        </div>

        <div className="calendar-operational-filters">
          <label className="calendar-field">
            Journée
            <select value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)}>
              <option value="ALL">Toutes les journées</option>
              {roundRecords.map((round) => (
                <option key={round.id} value={String(round.number)}>
                  Journée {round.number}
                </option>
              ))}
            </select>
          </label>

          <label className="calendar-field">
            Club
            <select value={clubFilter} onChange={(event) => setClubFilter(event.target.value)}>
              <option value="ALL">Tous les clubs</option>
              {activeClubs.map((entry) => (
                <option key={entry.club.id} value={entry.club.id}>
                  {entry.club.shortName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="calendar-operational-list">
          {filteredMatches.map((match) => {
            const kickoff = formatKickoff(match.kickoffAt);

            return (
              <div className="calendar-operational-match" key={match.id}>
                <div className="calendar-operational-round">
                  J{match.round?.number ?? '—'}
                </div>

                <div className="calendar-operational-teams">
                  <strong>{match.homeClub.shortName}</strong>
                  <span>—</span>
                  <strong>{match.awayClub.shortName}</strong>
                </div>

                <div className="calendar-operational-info">
                  <strong>{kickoff.date}</strong>
                  <span>{kickoff.time}</span>
                </div>

                <div className="calendar-operational-info">
                  <strong>{match.venue?.name ?? 'Stade à définir'}</strong>
                  <span>{matchStatusLabel[match.status] ?? match.status}</span>
                </div>

                {role === 'LIGUE_ADMIN' && (
                  <button
                    className="calendar-secondary calendar-manage-match"
                    onClick={() => void openMatchManagement(match)}
                  >
                    Gérer
                  </button>
                )}

                {selectedMatchId === match.id && role === 'LIGUE_ADMIN' && (
                  <div className="calendar-match-management">
                    <div className="calendar-match-management-header">
                      <div>
                        <small>GESTION DE LA RENCONTRE</small>
                        <h4>
                          {match.homeClub.shortName} — {match.awayClub.shortName}
                        </h4>
                      </div>

                      <button
                        className="calendar-secondary"
                        onClick={() => {
                          setSelectedMatchId(null);
                          setMatchHistory([]);
                        }}
                      >
                        Fermer
                      </button>
                    </div>

                    <div className="calendar-match-edit-grid">
                      <label className="calendar-field">
                        Date et heure
                        <input
                          type="datetime-local"
                          value={editKickoff}
                          onChange={(event) => setEditKickoff(event.target.value)}
                        />
                      </label>

                      <label className="calendar-field">
                        Stade
                        <select
                          value={editVenueId}
                          onChange={(event) => setEditVenueId(event.target.value)}
                        >
                          <option value="">Sélectionner un stade</option>
                          {approvedVenues.map((venue) => (
                            <option key={venue.id} value={venue.id}>
                              {venue.name} · {venue.city}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="calendar-field calendar-match-reason">
                        Motif de modification
                        <input
                          type="text"
                          placeholder="Ex. indisponibilité du terrain"
                          value={matchReason}
                          onChange={(event) => setMatchReason(event.target.value)}
                        />
                      </label>
                    </div>

                    {match.postponementReason && (
                      <div className="calendar-match-alert">
                        Motif actuel : {match.postponementReason}
                      </div>
                    )}

                    <div className="calendar-match-actions">
                      <button
                        className="calendar-primary"
                        disabled={busy || match.status === 'COMPLETED' || match.status === 'CANCELLED'}
                        onClick={() => void saveMatchSchedule()}
                      >
                        Reprogrammer / changer le stade
                      </button>

                      <button
                        className="calendar-secondary"
                        disabled={busy || match.status === 'COMPLETED' || match.status === 'CANCELLED'}
                        onClick={() => void changeSelectedMatchStatus('POSTPONED')}
                      >
                        Reporter
                      </button>

                      <button
                        className="calendar-danger"
                        disabled={busy || match.status === 'COMPLETED' || match.status === 'CANCELLED'}
                        onClick={() => void changeSelectedMatchStatus('CANCELLED')}
                      >
                        Annuler
                      </button>
                    </div>

                    <div className="calendar-match-history">
                      <div className="calendar-card-title">
                        <div>
                          <small>AUDIT</small>
                          <h4>Historique des modifications</h4>
                        </div>
                      </div>

                      {historyLoading && (
                        <span className="calendar-muted">
                          Chargement de l’historique…
                        </span>
                      )}

                      {!historyLoading && matchHistory.length === 0 && (
                        <span className="calendar-muted">
                          Aucune modification tracée pour cette rencontre.
                        </span>
                      )}

                      {!historyLoading &&
                        matchHistory.map((entry) => {
                          const metadata = entry.metadata ?? {};
                          const reason =
                            typeof metadata.reason === 'string'
                              ? metadata.reason
                              : null;

                          const actorName = [
                            entry.actor?.firstName,
                            entry.actor?.lastName,
                          ]
                            .filter(Boolean)
                            .join(' ');

                          return (
                            <div
                              className="calendar-history-entry"
                              key={entry.id}
                            >
                              <div>
                                <strong>{auditActionLabel[entry.action] ?? entry.action.replaceAll('_', ' ')}</strong>
                                <span>
                                  {new Date(entry.createdAt).toLocaleString('fr-FR')}
                                </span>
                              </div>

                              <div>
                                <span>
                                  {actorName || entry.actor?.email || 'Système'}
                                </span>
                                {reason && <em>{reason}</em>}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredMatches.length === 0 && (
            <div className="calendar-muted">
              Aucun match ne correspond aux filtres sélectionnés.
            </div>
          )}
        </div>
      </article>}

      <article className="calendar-card calendar-governance">
        <div className="calendar-card-title"><div><small>05 · GOUVERNANCE</small><h3>Validation humaine et publication</h3></div></div>
        <div className="calendar-governance-flow"><span>Digital Foot <b>propose</b></span><i>→</i><span>Responsable <b>soumet</b></span><i>→</i><span>Validateur <b>approuve</b></span><i>→</i><span>Ligue <b>matérialise et publie</b></span></div>
        <div className="calendar-actions">
          {(role === 'COMPETITION_MANAGER' || role === 'LIGUE_ADMIN') && latest?.status === 'GENERATED' && <button className="calendar-primary" disabled={busy} onClick={submit}>Soumettre pour validation</button>}
          {role === 'SCHEDULE_APPROVER' && latest?.status === 'SUBMITTED' && <><button className="calendar-primary" disabled={busy} onClick={() => decide('APPROVED')}>Approuver</button><button className="calendar-danger" disabled={busy} onClick={() => decide('REJECTED')}>Rejeter</button></>}
          {role === 'LIGUE_ADMIN' && latest?.status === 'APPROVED' && isMaterialized && <button className="calendar-primary" disabled={busy} onClick={publish}>Publier le calendrier</button>}
          {role === 'LIGUE_ADMIN' && latest?.status === 'APPROVED' && !isMaterialized && <span className="calendar-muted">Publication bloquée tant que les journées et rencontres de la proposition ne sont pas matérialisées complètement.</span>}
          {!latest && <span className="calendar-muted">Générez d’abord une proposition.</span>}
        </div>
        <p className="calendar-note">L’assistance numérique ne publie jamais seule : toute publication reste une décision de la Ligue.</p>
      </article>
    </section>
  );
}
