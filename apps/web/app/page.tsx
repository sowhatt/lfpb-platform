'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
type Actor = { email: string; memberships: { organizationId: string; role: string }[] };
type Organization = { id: string; name: string; code: string; type: string; active: boolean; club?: { id: string; shortName: string; division: string; city?: string } | null };
type Competition = { id: string; name: string; code: string; format: string; status: string; division?: string; season?: { name: string }; entries?: unknown[] };
type Match = { id: string; kickoffAt?: string; status: string; homeClub: { id: string; shortName: string }; awayClub: { id: string; shortName: string }; venue?: { name: string } | null; round?: { number: number } | null };
type Proposal = { id: string; version: number; status: string; qualityScore: number; generatedBy: string; createdAt: string };
type Registration = { id: string; status: string; person: { firstName: string; lastName: string; nationality?: string }; playerProfile?: { position: string; shirtNumber?: number } | null; staffProfile?: { function: string; qualification?: string } | null; officialProfile?: { function: string; level?: string } | null; licenses?: License[]; documents?: { id: string; type: string; status: string }[] };
type License = { id: string; number: string; season: string; status: string; registration?: Registration };
type Space = 'LIGUE' | 'CLUB' | 'OFFICIEL';

async function request<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { message?: string }).message ?? `Erreur ${response.status}`);
  return data as T;
}

export default function HomePage() {
  const [token, setToken] = useState('');
  const [actor, setActor] = useState<Actor | null>(null);
  const [active, setActive] = useState('Vue d’ensemble');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [players, setPlayers] = useState<Registration[]>([]);
  const [staff, setStaff] = useState<Registration[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [officials, setOfficials] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadDashboard(accessToken: string, currentActor?: Actor) {
    setLoading(true); setError('');
    try {
      const connectedActor = currentActor ?? actor;
      const membership = connectedActor?.memberships[0];
      const role = membership?.role ?? '';
      const [orgs, comps] = await Promise.all([
        request<Organization[]>('/organizations', accessToken),
        request<Competition[]>('/competitions', accessToken),
      ]);
      setOrganizations(orgs); setCompetitions(comps);
      if (comps[0]) {
        const [games, plans] = await Promise.all([
          request<Match[]>(`/competitions/${comps[0].id}/matches`, accessToken),
          request<Proposal[]>(`/competitions/${comps[0].id}/schedule-proposals`, accessToken).catch(() => []),
        ]);
        setMatches(games); setProposals(plans);
      }
      if (membership && role === 'CLUB_ADMIN') {
        const query = `?organizationId=${membership.organizationId}`;
        const [clubPlayers, clubStaff, clubLicenses] = await Promise.all([
          request<Registration[]>(`/registries/players${query}`, accessToken),
          request<Registration[]>(`/registries/staff${query}`, accessToken),
          request<License[]>(`/licenses${query}`, accessToken),
        ]);
        setPlayers(clubPlayers); setStaff(clubStaff); setLicenses(clubLicenses);
      } else if (membership && role === 'LIGUE_ADMIN') {
        const leagueOfficials = await request<Registration[]>(`/registries/officials?organizationId=${membership.organizationId}`, accessToken).catch(() => []);
        setOfficials(leagueOfficials);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chargement impossible'); }
    finally { setLoading(false); }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await request<{ accessToken: string; actor: Actor }>('/auth/login', undefined, {
        method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      setToken(result.accessToken); setActor(result.actor);
      sessionStorage.setItem('lfpb-token', result.accessToken);
      sessionStorage.setItem('lfpb-actor', JSON.stringify(result.actor));
      await loadDashboard(result.accessToken, result.actor);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Connexion impossible'); setLoading(false); }
  }

  function logout() { sessionStorage.clear(); setToken(''); setActor(null); }

  useEffect(() => {
    const savedToken = sessionStorage.getItem('lfpb-token');
    const savedActor = sessionStorage.getItem('lfpb-actor');
    if (savedToken && savedActor) { const restoredActor = JSON.parse(savedActor) as Actor; setToken(savedToken); setActor(restoredActor); void loadDashboard(savedToken, restoredActor); }
  }, []);

  const clubs = organizations.filter((org) => org.type === 'CLUB');
  const latestProposal = proposals[0];
  const role = actor?.memberships[0]?.role ?? '';
  const space: Space = role === 'CLUB_ADMIN' ? 'CLUB' : role === 'OFFICIEL' ? 'OFFICIEL' : 'LIGUE';
  const currentClubId = organizations.find((organization) => organization.id === actor?.memberships[0]?.organizationId)?.club?.id;
  const currentOrganizationId = actor?.memberships[0]?.organizationId;
  const visibleMatches = space === 'CLUB' && currentClubId ? matches.filter((match) => match.homeClub.id === currentClubId || match.awayClub.id === currentClubId) : matches;
  const nav = space === 'CLUB'
    ? ['Vue d’ensemble', 'Effectif', 'Staff', 'Licences', 'Calendrier']
    : space === 'OFFICIEL'
      ? ['Vue d’ensemble', 'Mes rencontres', 'Stades']
      : ['Vue d’ensemble', 'Compétitions', 'Calendrier RKJO', 'Clubs', 'Licences', 'Officiels', 'Rencontres'];
  const upcoming = useMemo(() => [...visibleMatches].sort((a, b) => (a.kickoffAt ?? '').localeCompare(b.kickoffAt ?? '')).slice(0, 5), [visibleMatches]);

  if (!token || !actor) return <LoginScreen loading={loading} error={error} onSubmit={login} />;

  return (
    <div className="shell">
      <aside>
        <div className="brand"><b>LF</b><span><strong>LFPB</strong><small>Football professionnel</small></span></div>
        <div className="space-chip">ESPACE {space}</div>
        <div className="connected"><i /> Connecté à l’API</div>
        <nav>{nav.map((item, i) => <button key={item} className={active === item ? 'active' : ''} onClick={() => setActive(item)}><i>{['⌂', '◫', '✦', '◆', '◉', '✓', '⬡'][i]}</i>{item}</button>)}</nav>
        <div className="user"><b>{actor.email.slice(0, 2).toUpperCase()}</b><span><strong>{actor.email}</strong><small>{actor.memberships[0]?.role.replaceAll('_', ' ')}</small></span><button onClick={logout}>↪</button></div>
      </aside>
      <main>
        <header><div><label>{space === 'CLUB' ? organizations[0]?.name : space === 'OFFICIEL' ? 'PORTAIL DES OFFICIELS' : 'DONNÉES TEMPS RÉEL · API LFPB'}</label><h1>{active}</h1><p>{loading ? 'Actualisation des données…' : space === 'CLUB' ? `${players.length} joueur(s) · ${staff.length} membre(s) du staff · ${licenses.length} licence(s)` : `${clubs.length} clubs · ${competitions.length} compétition(s) · ${visibleMatches.length} rencontre(s)`}</p></div><div className="actions"><button onClick={() => loadDashboard(token, actor)}>↻ Actualiser</button>{space === 'LIGUE' && <button className="primary" onClick={() => setActive('Calendrier RKJO')}>Ouvrir RKJO</button>}</div></header>
        {error && <div className="api-error">{error}</div>}
        {active === 'Vue d’ensemble' && (space === 'CLUB' ? <ClubOverview organization={organizations[0]} players={players} staff={staff} licenses={licenses} matches={upcoming} /> : space === 'OFFICIEL' ? <OfficialOverview matches={upcoming} /> : <Overview clubs={clubs} competitions={competitions} matches={upcoming} proposal={latestProposal} />)}
        {active === 'Clubs' && <ClubsView clubs={clubs} />}
        {active === 'Compétitions' && <CompetitionsView competitions={competitions} />}
        {active === 'Rencontres' && <MatchesView matches={matches} />}
        {active === 'Calendrier RKJO' && <PlannerView proposals={proposals} />}
        {active === 'Effectif' && currentOrganizationId && <PlayersWorkspace registrations={players} organizationId={currentOrganizationId} token={token} onCreated={() => loadDashboard(token, actor)} />}
        {active === 'Staff' && <RegistrationsView title="Staff technique et médical" registrations={staff} profile="staff" />}
        {active === 'Licences' && (space === 'CLUB' ? <LicensesView licenses={licenses} /> : <LeagueLicensesView clubs={clubs} />)}
        {active === 'Officiels' && <RegistrationsView title="Arbitres et officiels" registrations={officials} profile="official" />}
        {active === 'Calendrier' && <MatchesView matches={visibleMatches} />}
        {active === 'Mes rencontres' && <MatchesView matches={visibleMatches} />}
        {active === 'Stades' && <OfficialVenuesNotice />}
      </main>
    </div>
  );
}

function LoginScreen({ loading, error, onSubmit }: { loading: boolean; error: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="login-page"><section className="login-brand"><div className="login-logo">LF</div><p>LIGUE DE FOOTBALL PROFESSIONNEL DU BÉNIN</p><h1>Le football béninois,<br />piloté numériquement.</h1><span>Compétitions · Clubs · Licences · Officiels</span></section><form className="login-card" onSubmit={onSubmit}><label>PLATEFORME SÉCURISÉE</label><h2>Connexion</h2><p>Accédez à votre espace Ligue ou Club.</p>{error && <div className="form-error">{error}</div>}<span>Adresse e-mail</span><input name="email" type="email" defaultValue="admin@lfpb.bj" required /><span>Mot de passe</span><input name="password" type="password" defaultValue="change-this-development-password" required /><button disabled={loading}>{loading ? 'Connexion…' : 'Se connecter →'}</button><small>Environnement local sécurisé · API port 3001</small></form></div>;
}

function Overview({ clubs, competitions, matches, proposal }: { clubs: Organization[]; competitions: Competition[]; matches: Match[]; proposal?: Proposal }) {
  return <><section className="stats"><Stat value={String(clubs.length)} label="Clubs enregistrés" detail="Données PostgreSQL" /><Stat value={String(competitions.length)} label="Compétitions" detail="Toutes saisons" /><Stat value={String(matches.length)} label="Prochaines rencontres" detail="Calendrier actuel" /><Stat value={proposal ? `${proposal.qualityScore}%` : '—'} label="Qualité RKJO" detail={proposal?.status ?? 'Aucune proposition'} /></section><section className="main-grid"><MatchesPanel matches={matches} /><article className="planner"><div className="orbit">RKJO</div><label>PLANIFICATEUR INTELLIGENT</label><h2>{proposal ? `Proposition v${proposal.version}` : 'Aucune proposition active'}</h2><p>Cette information provient maintenant de l’API de gouvernance du calendrier.</p><div className="score"><strong>{proposal?.qualityScore ?? '—'}</strong><span>/100<br />{proposal?.status ?? 'À générer'}</span></div></article></section></>;
}
function ClubOverview({ organization, players, staff, licenses, matches }: { organization?: Organization; players: Registration[]; staff: Registration[]; licenses: License[]; matches: Match[] }) {
  const approved = licenses.filter((license) => license.status === 'APPROVED').length;
  return <><section className="welcome-card"><span>MON CLUB</span><h2>{organization?.name ?? 'Club'}</h2><p>{organization?.club?.division.replace('_', ' ')} · {organization?.club?.city ?? 'Ville non renseignée'}</p></section><section className="stats"><Stat value={String(players.length)} label="Joueurs" detail="Effectif enregistré" /><Stat value={String(staff.length)} label="Membres du staff" detail="Encadrement du club" /><Stat value={String(approved)} label="Licences approuvées" detail={`${licenses.length} dossier(s) au total`} /><Stat value={String(matches.length)} label="Rencontres" detail="Calendrier disponible" /></section><MatchesPanel matches={matches} /></>;
}
function OfficialOverview({ matches }: { matches: Match[] }) {
  return <><section className="stats"><Stat value={String(matches.length)} label="Rencontres disponibles" detail="Calendrier de la compétition" /><Stat value="—" label="Désignations" detail="Module Sprint feuille de match" /><Stat value="—" label="Rapports" detail="Module à venir" /><Stat value="API" label="Accès sécurisé" detail="Rôle OFFICIEL" /></section><MatchesPanel matches={matches} /></>;
}
function Stat({ value, label, detail }: { value: string; label: string; detail: string }) { return <article><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function MatchesPanel({ matches }: { matches: Match[] }) { return <article className="panel fixtures"><div className="title"><span><label>API · RENCONTRES</label><h2>Prochaines rencontres</h2></span></div>{matches.length === 0 ? <Empty text="Aucune rencontre trouvée" /> : matches.map((game) => <div className="fixture" key={game.id}><b className="day">J{game.round?.number ?? '—'}<small>{formatDate(game.kickoffAt)}</small></b><div className="teams"><span>{game.homeClub.shortName}</span><em>VS</em><span>{game.awayClub.shortName}</span></div><div className="meta"><strong>{formatTime(game.kickoffAt)}</strong><small>⌖ {game.venue?.name ?? 'Stade à définir'}</small></div></div>)}</article>; }
function ClubsView({ clubs }: { clubs: Organization[] }) { return <DataPanel title="Clubs gérés par la Ligue"><table><thead><tr><th>Club</th><th>Code</th><th>Division</th><th>Ville</th><th>État</th></tr></thead><tbody>{clubs.map((club) => <tr key={club.id}><td><strong>{club.name}</strong></td><td>{club.code}</td><td>{club.club?.division.replace('_', ' ')}</td><td>{club.club?.city ?? '—'}</td><td><Badge value={club.active ? 'ACTIF' : 'INACTIF'} /></td></tr>)}</tbody></table></DataPanel>; }
function CompetitionsView({ competitions }: { competitions: Competition[] }) { return <DataPanel title="Compétitions"><table><thead><tr><th>Nom</th><th>Code</th><th>Format</th><th>Division</th><th>Statut</th></tr></thead><tbody>{competitions.map((c) => <tr key={c.id}><td><strong>{c.name}</strong></td><td>{c.code}</td><td>{c.format.replaceAll('_', ' ')}</td><td>{c.division?.replace('_', ' ') ?? '—'}</td><td><Badge value={c.status} /></td></tr>)}</tbody></table></DataPanel>; }
function MatchesView({ matches }: { matches: Match[] }) { return <DataPanel title="Toutes les rencontres"><table><thead><tr><th>Journée</th><th>Affiche</th><th>Date</th><th>Stade</th><th>Statut</th></tr></thead><tbody>{matches.map((m) => <tr key={m.id}><td>J{m.round?.number ?? '—'}</td><td><strong>{m.homeClub.shortName} — {m.awayClub.shortName}</strong></td><td>{formatDate(m.kickoffAt)} · {formatTime(m.kickoffAt)}</td><td>{m.venue?.name ?? '—'}</td><td><Badge value={m.status} /></td></tr>)}</tbody></table></DataPanel>; }
function PlannerView({ proposals }: { proposals: Proposal[] }) { return <DataPanel title="Propositions RKJO"><table><thead><tr><th>Version</th><th>Moteur</th><th>Qualité</th><th>Date</th><th>Statut</th></tr></thead><tbody>{proposals.map((p) => <tr key={p.id}><td><strong>Version {p.version}</strong></td><td>{p.generatedBy}</td><td>{p.qualityScore}/100</td><td>{formatDate(p.createdAt)}</td><td><Badge value={p.status} /></td></tr>)}</tbody></table>{proposals.length === 0 && <Empty text="Aucune proposition accessible avec ce rôle" />}</DataPanel>; }
function PlayersWorkspace({ registrations, organizationId, token, onCreated }: { registrations: Registration[]; organizationId: string; token: string; onCreated: () => Promise<void> }) {
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  async function createPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      await request('/registries/players', token, { method: 'POST', body: JSON.stringify({
        organizationId,
        firstName: form.get('firstName'),
        lastName: form.get('lastName'),
        birthDate: form.get('birthDate'),
        nationality: form.get('nationality'),
        position: form.get('position'),
        shirtName: form.get('shirtName') || undefined,
        shirtNumber: form.get('shirtNumber') ? Number(form.get('shirtNumber')) : undefined,
        startDate: form.get('startDate'),
      }) });
      event.currentTarget.reset(); setCreating(false); setMessage('Joueur ajouté à l’effectif.'); await onCreated();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Création impossible'); }
    finally { setSaving(false); }
  }
  return <><section className="workspace-actions"><div><label>GESTION DU CLUB</label><h2>Effectif</h2><p>Les joueurs créés sont enregistrés en brouillon avant validation de leur licence.</p></div><button className="primary" onClick={() => setCreating((value) => !value)}>{creating ? 'Fermer' : '+ Ajouter un joueur'}</button></section>{message && <div className="success-message">{message}</div>}{creating && <form className="entity-form" onSubmit={createPlayer}><div><label>Prénom</label><input name="firstName" required /></div><div><label>Nom</label><input name="lastName" required /></div><div><label>Date de naissance</label><input name="birthDate" type="date" required /></div><div><label>Nationalité</label><input name="nationality" defaultValue="Béninoise" required /></div><div><label>Poste</label><select name="position" required><option value="GOALKEEPER">Gardien de but</option><option value="DEFENDER">Défenseur</option><option value="MIDFIELDER">Milieu de terrain</option><option value="FORWARD">Attaquant</option></select></div><div><label>Nom sur le maillot</label><input name="shirtName" /></div><div><label>Numéro</label><input name="shirtNumber" type="number" min="1" max="99" /></div><div><label>Date d’arrivée</label><input name="startDate" type="date" defaultValue="2026-08-01" required /></div><button disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer le joueur'}</button></form>}<RegistrationsView title="Effectif du club" registrations={registrations} profile="player" /></>;
}
function RegistrationsView({ title, registrations, profile }: { title: string; registrations: Registration[]; profile: 'player' | 'staff' | 'official' }) { return <DataPanel title={title}>{registrations.length === 0 ? <Empty text="Aucune donnée enregistrée" /> : <table><thead><tr><th>Nom</th><th>{profile === 'player' ? 'Poste' : 'Fonction'}</th><th>{profile === 'player' ? 'N°' : 'Qualification / niveau'}</th><th>Statut</th></tr></thead><tbody>{registrations.map((r) => <tr key={r.id}><td><strong>{r.person.firstName} {r.person.lastName}</strong></td><td>{profile === 'player' ? translatePosition(r.playerProfile?.position) : profile === 'staff' ? translateFunction(r.staffProfile?.function) : translateFunction(r.officialProfile?.function)}</td><td>{profile === 'player' ? r.playerProfile?.shirtNumber ?? '—' : profile === 'staff' ? r.staffProfile?.qualification ?? '—' : r.officialProfile?.level ?? '—'}</td><td><Badge value={r.status} /></td></tr>)}</tbody></table>}</DataPanel>; }
function LicensesView({ licenses }: { licenses: License[] }) { return <DataPanel title="Licences du club">{licenses.length === 0 ? <Empty text="Aucune licence enregistrée" /> : <table><thead><tr><th>Numéro</th><th>Saison</th><th>Statut</th></tr></thead><tbody>{licenses.map((l) => <tr key={l.id}><td><strong>{l.number}</strong></td><td>{l.season}</td><td><Badge value={l.status} /></td></tr>)}</tbody></table>}</DataPanel>; }
function LeagueLicensesView({ clubs }: { clubs: Organization[] }) { return <DataPanel title="Contrôle des licences"><Empty text={`${clubs.length} club(s) sous supervision — file de validation détaillée au prochain incrément`} /></DataPanel>; }
function OfficialVenuesNotice() { return <DataPanel title="Stades et accès"><Empty text="Les stades sont disponibles depuis l’API ; les consignes de mission seront reliées aux désignations." /></DataPanel>; }
function DataPanel({ title, children }: { title: string; children: ReactNode }) { return <section className="data-panel"><div className="title"><span><label>DONNÉES RÉELLES</label><h2>{title}</h2></span></div><div className="table-wrap">{children}</div></section>; }
function Badge({ value }: { value: string }) { return <span className={`badge ${value.toLowerCase()}`}>{value.replaceAll('_', ' ')}</span>; }
function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }
function formatDate(value?: string) { return value ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(value)) : 'À définir'; }
function formatTime(value?: string) { return value ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—'; }
function translatePosition(value?: string) { return ({ GOALKEEPER: 'Gardien', DEFENDER: 'Défenseur', MIDFIELDER: 'Milieu de terrain', FORWARD: 'Attaquant' } as Record<string, string>)[value ?? ''] ?? value ?? '—'; }
function translateFunction(value?: string) { return ({ HEAD_COACH: 'Entraîneur principal', ASSISTANT_COACH: 'Entraîneur adjoint', GOALKEEPER_COACH: 'Entraîneur des gardiens', PHYSIOTHERAPIST: 'Kinésithérapeute', DOCTOR: 'Médecin', TEAM_MANAGER: 'Manager', REFEREE: 'Arbitre', ASSISTANT_REFEREE: 'Arbitre assistant', FOURTH_OFFICIAL: 'Quatrième officiel', MATCH_COMMISSIONER: 'Commissaire au match' } as Record<string, string>)[value ?? ''] ?? value ?? '—'; }
