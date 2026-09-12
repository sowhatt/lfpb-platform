'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type Actor = { email: string; memberships: { organizationId: string; role: string }[] };
type Competition = { id: string; name: string };
type Match = {
  id: string;
  kickoffAt?: string | null;
  homeClub: { shortName: string };
  awayClub: { shortName: string };
  venue?: { name: string } | null;
  round?: { number: number } | null;
};
type Registration = {
  id: string;
  person: { firstName: string; lastName: string };
  officialProfile?: { function: string; level?: string | null } | null;
};
type Assignment = {
  id: string;
  role: string;
  status: string;
  match: Match;
  officialProfile: { registration: { person: { firstName: string; lastName: string } } };
};

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { message?: string }).message ?? `Erreur ${response.status}`);
  return payload as T;
}

export default function LeagueAssignmentsPage() {
  const [token, setToken] = useState('');
  const [actor, setActor] = useState<Actor | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [officials, setOfficials] = useState<Registration[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load(accessToken: string, currentActor: Actor) {
    setLoading(true); setError('');
    try {
      const membership = currentActor.memberships.find((item) => item.role === 'LIGUE_ADMIN');
      if (!membership) throw new Error('Cette page est réservée à la Ligue.');
      const competitions = await request<Competition[]>('/competitions', accessToken);
      const games = (await Promise.all(competitions.map((competition) => request<Match[]>(`/competitions/${competition.id}/matches`, accessToken).catch(() => [])))).flat();
      const [leagueOfficials, currentAssignments] = await Promise.all([
        request<Registration[]>(`/registries/officials?organizationId=${membership.organizationId}`, accessToken),
        request<Assignment[]>('/official-assignments', accessToken),
      ]);
      setMatches(games); setOfficials(leagueOfficials); setAssignments(currentAssignments);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chargement impossible'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const savedToken = sessionStorage.getItem('lfpb-token') ?? '';
    const savedActor = sessionStorage.getItem('lfpb-actor');
    if (!savedToken || !savedActor) { setError('Connectez-vous d’abord à Digital Foot avec un compte Ligue.'); setLoading(false); return; }
    const parsed = JSON.parse(savedActor) as Actor;
    setToken(savedToken); setActor(parsed); void load(savedToken, parsed);
  }, []);

  async function designate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!token || !actor) return;
    const form = new FormData(event.currentTarget);
    setLoading(true); setError(''); setMessage('');
    try {
      const created = await request<{ id: string }>('/official-assignments', token, { method: 'POST', body: JSON.stringify({ matchId: String(form.get('matchId')), officialProfileId: String(form.get('officialProfileId')), role: String(form.get('role')) }) });
      await request(`/official-assignments/${created.id}/send`, token, { method: 'PATCH' });
      setMessage('Désignation envoyée. L’officiel peut maintenant accepter ou refuser sa mission.');
      await load(token, actor); event.currentTarget.reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Désignation impossible'); setLoading(false); }
  }

  async function cancelAssignment(assignment: Assignment) {
    if (!token || !actor) return;
    const official = `${assignment.officialProfile.registration.person.firstName} ${assignment.officialProfile.registration.person.lastName}`;
    if (!window.confirm(`Annuler la désignation de ${official} pour ${assignment.match.homeClub.shortName} — ${assignment.match.awayClub.shortName} ?`)) return;
    setWorkingId(assignment.id); setError(''); setMessage('');
    try {
      await request(`/official-assignments/${assignment.id}/cancel`, token, { method: 'PATCH' });
      setMessage('Désignation annulée. Le rôle est maintenant disponible pour une nouvelle affectation.');
      await load(token, actor);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Annulation impossible'); }
    finally { setWorkingId(''); }
  }

  const sortedMatches = useMemo(() => [...matches].sort((a, b) => String(a.kickoffAt ?? '').localeCompare(String(b.kickoffAt ?? ''))), [matches]);
  const pending = assignments.filter((a) => a.status === 'SENT').length;
  const accepted = assignments.filter((a) => a.status === 'ACCEPTED').length;
  const refused = assignments.filter((a) => a.status === 'REFUSED').length;

  return <div className="shell">
    <aside>
      <div className="brand"><b>LF</b><span><strong>LFPB</strong><small>Football professionnel</small></span></div>
      <div className="space-chip">ESPACE LIGUE</div><div className="connected"><i /> Connecté à l’API</div>
      <nav><button onClick={() => window.location.assign('/')}><i>⌂</i>Vue d’ensemble</button><button onClick={() => window.location.assign('/')}><i>◫</i>Compétitions</button><button className="active"><i>✓</i>Désignations</button><button onClick={() => window.location.assign('/')}><i>⬡</i>Officiels</button></nav>
      <div className="user"><b>{actor?.email.slice(0,2).toUpperCase() ?? 'LF'}</b><span><strong>{actor?.email ?? 'LFPB'}</strong><small>LIGUE ADMIN</small></span></div>
    </aside>
    <main>
      <header><div><label>LIGUE DE FOOTBALL PROFESSIONNEL DU BÉNIN</label><h1>Désignation des officiels</h1><p>Préparez, envoyez et suivez les désignations des arbitres et officiels.</p></div><div className="actions"><button onClick={() => token && actor && void load(token, actor)} disabled={loading}>↻ Actualiser</button><button className="primary" onClick={() => window.location.assign('/')}>Retour Digital Foot</button></div></header>
      {error && <div className="api-error">{error}</div>}{message && <div className="success-message">{message}</div>}
      <section className="stats">
        <article><span>Officiels disponibles</span><strong>{officials.length}</strong><small>Référentiel Ligue</small><i className="symbol s1">◉</i></article>
        <article><span>Désignations envoyées</span><strong>{pending}</strong><small>En attente de réponse</small><i className="symbol s2">↗</i></article>
        <article><span>Missions acceptées</span><strong>{accepted}</strong><small>Confirmées par les officiels</small><i className="symbol">✓</i></article>
        <article><span>Refus</span><strong>{refused}</strong><small>À replanifier</small><i className="symbol s3">!</i></article>
      </section>
      <section className="workspace-actions"><div><label>WORKFLOW DE DÉSIGNATION</label><h2>Nouvelle mission officielle</h2><p>Sélectionnez la rencontre, l’officiel et son rôle. Digital Foot envoie ensuite la mission dans son espace.</p></div><span className="badge active">LIGUE → OFFICIEL</span></section>
      <form onSubmit={designate} className="entity-form">
        <div><label>RENCONTRE</label><select name="matchId" required disabled={loading} defaultValue=""><option value="" disabled>Choisir une rencontre</option>{sortedMatches.map((m) => <option key={m.id} value={m.id}>{m.homeClub.shortName} — {m.awayClub.shortName} · {formatDate(m.kickoffAt)}</option>)}</select></div>
        <div><label>OFFICIEL</label><select name="officialProfileId" required disabled={loading} defaultValue=""><option value="" disabled>Choisir un officiel</option>{officials.map((o) => <option key={o.id} value={o.id}>{o.person.firstName} {o.person.lastName}{o.officialProfile?.level ? ` · ${o.officialProfile.level}` : ''}</option>)}</select></div>
        <div><label>RÔLE SUR LA RENCONTRE</label><select name="role" required disabled={loading} defaultValue="REFEREE"><option value="REFEREE">Arbitre principal</option><option value="ASSISTANT_REFEREE_1">Arbitre assistant 1</option><option value="ASSISTANT_REFEREE_2">Arbitre assistant 2</option><option value="FOURTH_OFFICIAL">Quatrième officiel</option><option value="MATCH_COMMISSIONER">Commissaire au match</option><option value="DELEGATE">Délégué</option></select></div>
        <button type="submit" disabled={loading || !matches.length || !officials.length}>{loading ? 'Traitement…' : 'Désigner et envoyer'}</button>
      </form>
      <section className="data-panel"><div className="title"><div><label>SUIVI OPÉRATIONNEL</label><h2>Désignations en cours</h2></div><span className="badge">{assignments.length} mission(s)</span></div>
        {!loading && assignments.length === 0 && <div className="empty">Aucune désignation enregistrée.</div>}
        {assignments.length > 0 && <div className="table-wrap"><table><thead><tr><th>Rencontre</th><th>Officiel</th><th>Rôle</th><th>Date</th><th>Stade</th><th>Statut</th><th>Action</th></tr></thead><tbody>{assignments.map((a) => <tr key={a.id}><td><strong>{a.match.homeClub.shortName} — {a.match.awayClub.shortName}</strong></td><td>{a.officialProfile.registration.person.firstName} {a.officialProfile.registration.person.lastName}</td><td>{roleLabel(a.role)}</td><td>{formatDate(a.match.kickoffAt)}</td><td>{a.match.venue?.name ?? 'À définir'}</td><td><span className={`badge ${statusClass(a.status)}`}>{statusLabel(a.status)}</span></td><td>{['DRAFT','SENT','ACCEPTED'].includes(a.status) ? <button type="button" onClick={() => void cancelAssignment(a)} disabled={workingId === a.id}>{workingId === a.id ? 'Annulation…' : 'Annuler'}</button> : '—'}</td></tr>)}</tbody></table></div>}
      </section>
    </main>
  </div>;
}

function formatDate(value?: string | null) { if (!value) return 'Date à définir'; return new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)); }
function roleLabel(value:string){return ({REFEREE:'Arbitre principal',ASSISTANT_REFEREE_1:'Assistant 1',ASSISTANT_REFEREE_2:'Assistant 2',FOURTH_OFFICIAL:'4e officiel',MATCH_COMMISSIONER:'Commissaire',DELEGATE:'Délégué'} as Record<string,string>)[value]??value;}
function statusLabel(value:string){return ({DRAFT:'Brouillon',SENT:'Réponse attendue',ACCEPTED:'Acceptée',REFUSED:'Refusée',CANCELLED:'Annulée'} as Record<string,string>)[value]??value;}
function statusClass(value:string){if(value==='ACCEPTED')return'active';if(value==='SENT'||value==='DRAFT')return'draft';if(value==='REFUSED'||value==='CANCELLED')return'rejected';return'';}
