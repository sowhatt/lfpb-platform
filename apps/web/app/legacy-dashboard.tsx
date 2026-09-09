'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { OfficialVoiceAssistant } from './official-voice-assistant';
import { StaffWorkspace } from './staff-workspace';
import { ClubLicenseWorkspace } from './club-license-workspace';
import { navigationForSpace, resolveSpace } from './space-policy';
import type { Space } from './space-policy';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
type Actor = { email: string; memberships: { organizationId: string; role: string }[] };
type Organization = { id: string; name: string; code: string; type: string; active: boolean; club?: { id: string; shortName: string; division: string; city?: string } | null };
type Competition = { id: string; name: string; code: string; format: string; status: string; division?: string; season?: { name: string }; entries?: unknown[] };
type Match = { id: string; kickoffAt?: string; status: string; homeClub: { id: string; shortName: string }; awayClub: { id: string; shortName: string }; venue?: { name: string } | null; round?: { number: number } | null };
type Proposal = { id: string; version: number; status: string; qualityScore: number; generatedBy: string; createdAt: string };
type Registration = { id: string; organizationId?: string; status: string; startDate?: string; person: { firstName: string; lastName: string; birthDate?: string; nationality?: string; federationId?: string; photoDataUrl?: string | null }; playerProfile?: { position: string; shirtNumber?: number } | null; staffProfile?: { function: string; qualification?: string } | null; officialProfile?: { function: string; level?: string } | null; licenses?: License[]; documents?: { id: string; type: string; status: string }[] };
type License = { id: string; number?: string | null; season: string; status: string; rejectionReason?: string | null; registration?: Registration };
type LicenseChecklistItem = {
  code: string;
  label: string;
  type: string;
  required: boolean;
  condition?: string;
  present: boolean;
  documentId?: string | null;
  status?: string | null;
};
type LicenseChecklist = {
  registrationId: string;
  totalRequired: number;
  completedRequired: number;
  complete: boolean;
  items: LicenseChecklistItem[];
};

async function request<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { message?: string }).message ?? `Erreur ${response.status}`);
  return data as T;
}

function normalizeDateInput(value: FormDataEntryValue | null, label: string, options: { forbidFuture?: boolean } = {}): string {
  const raw = String(value ?? '').trim();
  const french = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const parts = french ? { day: french[1], month: french[2], year: french[3] } : iso ? { day: iso[3], month: iso[2], year: iso[1] } : null;
  if (!parts) throw new Error(`${label} doit être saisie au format JJ/MM/AAAA`);
  const year = Number(parts.year); const month = Number(parts.month); const day = Number(parts.day);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`${label} est invalide`);
  if (options.forbidFuture) {
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    if (date.getTime() > todayUtc) throw new Error(`${label} ne peut pas être dans le futur`);
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function preparePlayerPhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Sélectionnez une photo JPEG, PNG ou WebP');
  const source = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Lecture de la photo impossible')); reader.readAsDataURL(file); });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error('Cette image ne peut pas être traitée')); element.src = source; });
  const maximum = 640; const ratio = Math.min(1, maximum / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio));
  const context = canvas.getContext('2d'); if (!context) throw new Error('Traitement de la photo impossible'); context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const photoDataUrl = canvas.toDataURL('image/jpeg', 0.82); if (photoDataUrl.length > 1_000_000) throw new Error('La photo reste trop volumineuse après compression'); return photoDataUrl;
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
      const connectedActor = currentActor ?? actor; const membership = connectedActor?.memberships[0]; const role = membership?.role ?? '';
      const orgs = await request<Organization[]>('/organizations', accessToken);
      const comps = role === 'FEDERATION_AGENT' ? [] : await request<Competition[]>('/competitions', accessToken);
      setOrganizations(orgs); setCompetitions(comps);
      if (comps[0]) {
        const [games, plans] = await Promise.all([request<Match[]>(`/competitions/${comps[0].id}/matches`, accessToken), request<Proposal[]>(`/competitions/${comps[0].id}/schedule-proposals`, accessToken).catch(() => [])]);
        setMatches(games); setProposals(plans);
      }
      if (membership && role === 'CLUB_ADMIN') {
        const query = `?organizationId=${membership.organizationId}`;
        const [clubPlayers, clubStaff, clubLicenses] = await Promise.all([request<Registration[]>(`/registries/players${query}`, accessToken), request<Registration[]>(`/registries/staff${query}`, accessToken), request<License[]>(`/licenses${query}`, accessToken)]);
        setPlayers(clubPlayers); setStaff(clubStaff); setLicenses(clubLicenses);
      } else if (membership && (role === 'LIGUE_ADMIN' || role === 'FEDERATION_AGENT')) {
        const clubLicenses = await Promise.all(orgs.filter((organization) => organization.type === 'CLUB').map((organization) => request<License[]>(`/licenses?organizationId=${organization.id}`, accessToken)));
        setLicenses(clubLicenses.flat());
      }
      if (membership && role === 'LIGUE_ADMIN') {
        const leagueOfficials = await request<Registration[]>(`/registries/officials?organizationId=${membership.organizationId}`, accessToken).catch(() => []); setOfficials(leagueOfficials);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chargement impossible'); } finally { setLoading(false); }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(''); const form = new FormData(event.currentTarget);
    try {
      const result = await request<{ accessToken: string; actor: Actor }>('/auth/login', undefined, { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
      setToken(result.accessToken); setActor(result.actor); sessionStorage.setItem('lfpb-token', result.accessToken); sessionStorage.setItem('lfpb-actor', JSON.stringify(result.actor)); await loadDashboard(result.accessToken, result.actor);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Connexion impossible'); setLoading(false); }
  }

  function logout() {
    sessionStorage.removeItem('lfpb-token');
    sessionStorage.removeItem('lfpb-actor');
    setToken(''); setActor(null); setActive('Vue d’ensemble');
    setOrganizations([]); setCompetitions([]); setMatches([]); setProposals([]); setPlayers([]); setStaff([]); setLicenses([]); setOfficials([]); setError('');
  }

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') void navigator.serviceWorker.register('/sw.js');
      else {
        void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())));
        if ('caches' in window) void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
      }
    }
    const savedToken = sessionStorage.getItem('lfpb-token'); const savedActor = sessionStorage.getItem('lfpb-actor');
    if (savedToken && savedActor) { const restoredActor = JSON.parse(savedActor) as Actor; setToken(savedToken); setActor(restoredActor); void loadDashboard(savedToken, restoredActor); }
  }, []);

  const clubs = organizations.filter((org) => org.type === 'CLUB'); const latestProposal = proposals[0]; const role = actor?.memberships[0]?.role ?? ''; const space: Space = resolveSpace(role);
  const currentClubId = organizations.find((organization) => organization.id === actor?.memberships[0]?.organizationId)?.club?.id; const currentOrganizationId = actor?.memberships[0]?.organizationId;
  const visibleMatches = space === 'CLUB' && currentClubId ? matches.filter((match) => match.homeClub.id === currentClubId || match.awayClub.id === currentClubId) : matches;
  const nav = navigationForSpace(space); const upcoming = useMemo(() => [...visibleMatches].sort((a, b) => (a.kickoffAt ?? '').localeCompare(b.kickoffAt ?? '')).slice(0, 5), [visibleMatches]);
  if (!token || !actor) return <LoginScreen loading={loading} error={error} onSubmit={login} />;

  return <div className="shell"><aside><div className="brand"><b>LF</b><span><strong>LFPB</strong><small>Football professionnel</small></span></div><div className="space-chip">ESPACE {space}</div><div className="connected"><i /> Connecté à l’API</div><nav>{nav.map((item, i) => <button key={item} className={active === item ? 'active' : ''} onClick={() => setActive(item)}><i>{['⌂', '◫', '✦', '◆', '◉', '✓', '⬡'][i]}</i>{item}</button>)}<button className="mobile-logout" onClick={logout} aria-label="Se déconnecter"><i>↪</i>Déconnexion</button></nav><div className="user"><b>{actor.email.slice(0, 2).toUpperCase()}</b><span><strong>{actor.email}</strong><small>{actor.memberships[0]?.role.replaceAll('_', ' ')}</small></span><button onClick={logout} aria-label="Se déconnecter">↪</button></div></aside><main><header><div><label>{space === 'FEDERATION' ? 'FÉDÉRATION BÉNINOISE DE FOOTBALL' : space === 'CLUB' ? organizations[0]?.name : space === 'OFFICIEL' ? 'PORTAIL DES OFFICIELS' : 'DONNÉES TEMPS RÉEL · API LFPB'}</label><h1>{active}</h1><p>{loading ? 'Actualisation des données…' : space === 'FEDERATION' ? `${licenses.length} dossier(s) de licence` : space === 'CLUB' ? `${players.length} joueur(s) · ${staff.length} membre(s) du staff · ${licenses.length} dossier(s)` : `${clubs.length} clubs · ${competitions.length} compétition(s) · ${visibleMatches.length} rencontre(s)`}</p></div><div className="actions"><button onClick={() => loadDashboard(token, actor)}>↻ Actualiser</button>{space === 'LIGUE' && <button className="primary" onClick={() => setActive('Calendrier RKJO')}>Ouvrir RKJO</button>}</div></header>{error && <div className="api-error">{error}</div>}{active === 'Vue d’ensemble' && (space === 'FEDERATION' ? <FederationOverview licenses={licenses} /> : space === 'CLUB' ? <ClubOverview organization={organizations[0]} players={players} staff={staff} licenses={licenses} matches={upcoming} /> : space === 'OFFICIEL' ? <OfficialOverview matches={upcoming} /> : <Overview clubs={clubs} competitions={competitions} matches={upcoming} proposal={latestProposal} />)}{active === 'Clubs' && <ClubsView clubs={clubs} />}{active === 'Compétitions' && <CompetitionsView competitions={competitions} />}{active === 'Rencontres' && <MatchesView matches={matches} />}{active === 'Calendrier RKJO' && <PlannerView proposals={proposals} />}{active === 'Effectif' && currentOrganizationId && <PlayersWorkspace registrations={players} organizationId={currentOrganizationId} token={token} onCreated={() => loadDashboard(token, actor)} />}{active === 'Staff' && currentOrganizationId && <StaffWorkspace registrations={staff} organizationId={currentOrganizationId} token={token} onCreated={() => loadDashboard(token, actor)} />}{active === 'Licences' && (space === 'CLUB' ? <ClubLicenseWorkspace players={players} licenses={licenses} token={token} onChanged={() => loadDashboard(token, actor)} /> : <LicenseWorkflowView authority={space} licenses={licenses} clubs={clubs} token={token} onChanged={() => loadDashboard(token, actor)} />)}{active === 'Officiels' && <RegistrationsView title="Arbitres et officiels" registrations={officials} profile="official" />}{active === 'Calendrier' && <MatchesView matches={visibleMatches} />}{active === 'Mes rencontres' && <MatchesView matches={visibleMatches} />}{active === 'Assistant vocal' && space === 'OFFICIEL' && <OfficialVoiceAssistant token={token} />}{active === 'Stades' && <OfficialVenuesNotice />}</main></div>;
}

function LoginScreen({ loading, error, onSubmit }: { loading: boolean; error: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="login-page"><section className="login-brand"><div className="login-logo">LF</div><p>LIGUE DE FOOTBALL PROFESSIONNEL DU BÉNIN</p><h1>Le football béninois,<br />piloté numériquement.</h1><span>Compétitions · Clubs · Licences · Officiels</span></section><form className="login-card" onSubmit={onSubmit}><label>PLATEFORME SÉCURISÉE</label><h2>Connexion</h2><p>Accédez à votre espace Ligue, Club ou Officiel.</p>{error && <div className="form-error">{error}</div>}<span>Adresse e-mail</span><input name="email" type="email" autoComplete="username" required /><span>Mot de passe</span><input name="password" type="password" autoComplete="current-password" required /><button disabled={loading}>{loading ? 'Connexion…' : 'Se connecter →'}</button><small>Plateforme sécurisée LFPB</small></form></div>; }

function Overview({ clubs, competitions, matches, proposal }: { clubs: Organization[]; competitions: Competition[]; matches: Match[]; proposal?: Proposal }) { return <><section className="stats"><Stat value={String(clubs.length)} label="Clubs enregistrés" detail="Données PostgreSQL" /><Stat value={String(competitions.length)} label="Compétitions" detail="Toutes saisons" /><Stat value={String(matches.length)} label="Prochaines rencontres" detail="Calendrier actuel" /><Stat value={proposal ? `${proposal.qualityScore}%` : '—'} label="Qualité RKJO" detail={proposal?.status ?? 'Aucune proposition'} /></section><section className="main-grid"><MatchesPanel matches={matches} /><article className="planner"><div className="orbit">RKJO</div><label>PLANIFICATEUR INTELLIGENT</label><h2>{proposal ? `Proposition v${proposal.version}` : 'Aucune proposition active'}</h2><p>Cette information provient maintenant de l’API de gouvernance du calendrier.</p><div className="score"><strong>{proposal?.qualityScore ?? '—'}</strong><span>/100<br />{proposal?.status ?? 'À générer'}</span></div></article></section></>; }

function ClubOverview({ organization, players, staff, licenses, matches }: { organization?: Organization; players: Registration[]; staff: Registration[]; licenses: License[]; matches: Match[] }) { return <><section className="welcome-card"><span>ESPACE CLUB</span><h2>{organization?.name ?? 'Club'}</h2><p>Effectif, staff, licences et calendrier dans un espace isolé.</p></section><section className="stats"><Stat value={String(players.length)} label="Joueurs" detail="Effectif enregistré" /><Stat value={String(staff.length)} label="Staff" detail="Encadrement" /><Stat value={String(licenses.length)} label="Dossiers licences" detail="Saison courante" /><Stat value={String(matches.length)} label="Prochains matchs" detail="Calendrier club" /></section><MatchesPanel matches={matches} /></>; }
function FederationOverview({ licenses }: { licenses: License[] }) { const pending = licenses.filter((license) => license.status === 'TRANSMITTED_TO_FBF').length; const issued = licenses.filter((license) => license.status === 'ISSUED_BY_FBF').length; const rejected = licenses.filter((license) => license.status === 'REJECTED_BY_FBF').length; return <><section className="welcome-card"><span>ESPACE FÉDÉRATION</span><h2>File des licences transmises par la Ligue</h2><p>Décision finale FBF : délivrer ou refuser les licences transmises.</p></section><section className="stats"><Stat value={String(pending)} label="À décider" detail="Transmises par la Ligue" /><Stat value={String(issued)} label="Licences délivrées" detail="Décision FBF" /><Stat value={String(rejected)} label="Licences refusées" detail="Décision FBF" /><Stat value={String(licenses.length)} label="Dossiers visibles" detail="Périmètre fédération" /></section></>; }
function OfficialOverview({ matches }: { matches: Match[] }) { return <><section className="welcome-card"><span>ESPACE OFFICIEL</span><h2>Mes missions terrain</h2><p>Consultez vos rencontres et utilisez l’assistant vocal pour préparer vos interventions.</p></section><MatchesPanel matches={matches} /></>; }
function Stat({ value, label, detail }: { value: string; label: string; detail: string }) { return <article><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function MatchesPanel({ matches }: { matches: Match[] }) { return <article className="panel"><div className="title"><div><label>PROCHAINES RENCONTRES</label><h2>Calendrier publié</h2></div></div>{matches.length ? matches.map((match) => <Fixture key={match.id} match={match} />) : <div className="empty">Aucune rencontre publiée.</div>}</article>; }
function Fixture({ match }: { match: Match }) { const date = match.kickoffAt ? new Date(match.kickoffAt) : null; return <div className="fixture"><div className="day">{date ? date.toLocaleDateString('fr-FR', { day: '2-digit' }) : '—'}<small>{date ? date.toLocaleDateString('fr-FR', { month: 'short' }).toUpperCase() : 'TBD'}</small></div><div className="teams"><span><i>{match.homeClub.shortName.slice(0, 2).toUpperCase()}</i>{match.homeClub.shortName}</span><em>VS</em><span><i className="green">{match.awayClub.shortName.slice(0, 2).toUpperCase()}</i>{match.awayClub.shortName}</span></div><div className="meta"><strong>{date ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'À définir'}</strong><small>{match.venue?.name ?? match.status}</small></div><button>›</button></div>; }
function ClubsView({ clubs }: { clubs: Organization[] }) { return <DataTable headers={['Club', 'Code', 'Division', 'Ville', 'Statut']} rows={clubs.map((club) => [club.name, club.code, club.club?.division ?? '—', club.club?.city ?? '—', <Badge key={club.id} value={club.active ? 'Actif' : 'Inactif'} />])} />; }
function CompetitionsView({ competitions }: { competitions: Competition[] }) { return <DataTable headers={['Compétition', 'Code', 'Saison', 'Format', 'Statut']} rows={competitions.map((competition) => [competition.name, competition.code, competition.season?.name ?? '—', competition.format.replaceAll('_', ' '), <Badge key={competition.id} value={competition.status} />])} />; }
function MatchesView({ matches }: { matches: Match[] }) { return <DataTable headers={['Date', 'Domicile', 'Extérieur', 'Stade', 'Journée', 'Statut']} rows={matches.map((match) => [match.kickoffAt ? new Date(match.kickoffAt).toLocaleString('fr-FR') : 'À définir', match.homeClub.shortName, match.awayClub.shortName, match.venue?.name ?? '—', match.round?.number ?? '—', <Badge key={match.id} value={match.status} />])} />; }
function RegistrationsView({ title, registrations, profile }: { title: string; registrations: Registration[]; profile: 'player' | 'staff' | 'official' }) { return <section className="data-panel"><div className="title"><div><label>REGISTRE</label><h2>{title}</h2></div></div><div className="table-wrap"><table><thead><tr><th>Identité</th><th>Profil</th><th>Numéro</th><th>Statut</th></tr></thead><tbody>{registrations.map((registration) => <tr key={registration.id}><td><strong>{registration.person.firstName} {registration.person.lastName}</strong><br /><small>{registration.person.federationId ?? 'Sans identifiant fédéral'}</small></td><td>{profile === 'player' ? registration.playerProfile?.position : profile === 'staff' ? registration.staffProfile?.function : registration.officialProfile?.function}</td><td>{registration.playerProfile?.shirtNumber ?? '—'}</td><td><Badge value={registration.status} /></td></tr>)}</tbody></table></div></section>; }
function PlannerView({ proposals }: { proposals: Proposal[] }) { return <DataTable headers={['Version', 'Statut', 'Qualité', 'Moteur', 'Création']} rows={proposals.map((proposal) => [`v${proposal.version}`, <Badge key={proposal.id} value={proposal.status} />, `${proposal.qualityScore}/100`, proposal.generatedBy, new Date(proposal.createdAt).toLocaleString('fr-FR')])} />; }
function OfficialVenuesNotice() { return <section className="data-panel"><div className="title"><div><label>TERRAIN</label><h2>Stades de mes rencontres</h2></div></div><div className="empty">Les stades sont consultables depuis les rencontres affectées à l’officiel.</div></section>; }
function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) { return <section className="data-panel"><div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>{!rows.length && <div className="empty">Aucune donnée disponible.</div>}</div></section>; }
function Badge({ value }: { value: string }) { return <span className={`badge ${value.toLowerCase()}`}>{value.replaceAll('_', ' ')}</span>; }

function PlayersWorkspace({ registrations, organizationId, token, onCreated }: { registrations: Registration[]; organizationId: string; token: string; onCreated: () => void }) {
  const [showForm, setShowForm] = useState(false); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(''); const [formError, setFormError] = useState(''); const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null); const [profile, setProfile] = useState<Registration | null>(null); const [profileLoading, setProfileLoading] = useState(false); const [profileError, setProfileError] = useState(''); const photoInputRef = useRef<HTMLInputElement | null>(null);
  async function createPlayer(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setFormError(''); setMessage(''); const form = new FormData(event.currentTarget); try { const birthDate = normalizeDateInput(form.get('birthDate'), 'La date de naissance', { forbidFuture: true }); const startDate = normalizeDateInput(form.get('startDate'), "La date d'entrée au club"); await request('/registries/players', token, { method: 'POST', body: JSON.stringify({ organizationId, firstName: form.get('firstName'), lastName: form.get('lastName'), birthDate, nationality: form.get('nationality'), federationId: form.get('federationId') || undefined, startDate, position: form.get('position'), shirtNumber: form.get('shirtNumber') ? Number(form.get('shirtNumber')) : undefined }) }); event.currentTarget.reset(); setShowForm(false); setMessage('Joueur enregistré avec succès.'); onCreated(); } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Création impossible'); } finally { setSaving(false); } }
  async function openProfile(registrationId: string) { setSelectedRegistrationId(registrationId); setProfile(null); setProfileError(''); setProfileLoading(true); try { setProfile(await request<Registration>(`/registries/players/${registrationId}`, token)); } catch (reason) { setProfileError(reason instanceof Error ? reason.message : 'Chargement du profil impossible'); } finally { setProfileLoading(false); } }
  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file || !selectedRegistrationId) return; setProfileError(''); setProfileLoading(true); try { const photoDataUrl = await preparePlayerPhoto(file); const updated = await request<Registration>(`/registries/players/${selectedRegistrationId}/photo`, token, { method: 'PATCH', body: JSON.stringify({ photoDataUrl }) }); setProfile(updated); setMessage('Photo du joueur mise à jour.'); onCreated(); } catch (reason) { setProfileError(reason instanceof Error ? reason.message : 'Mise à jour de la photo impossible'); } finally { setProfileLoading(false); event.target.value = ''; } }
  if (selectedRegistrationId) { return <section className="data-panel"><button className="profile-back" type="button" onClick={() => { setSelectedRegistrationId(null); setProfile(null); setProfileError(''); }}>← Retour à l’effectif</button>{profileLoading && <div className="profile-loading">Chargement du profil…</div>}{profileError && <div className="form-error">{profileError}</div>}{profile && <PlayerProfile registration={profile} onChoosePhoto={() => photoInputRef.current?.click()} />}<input ref={photoInputRef} className="profile-photo-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} />{message && <div className="success-message">{message}</div>}</section>; }
  return <><section className="workspace-actions"><div><label>GESTION EFFECTIF</label><h2>Joueurs du club</h2><p>{registrations.length} joueur(s) enregistré(s)</p></div><button onClick={() => setShowForm((value) => !value)}>{showForm ? 'Fermer' : '+ Nouveau joueur'}</button></section>{showForm && <form className="entity-form" onSubmit={createPlayer}><div><label>Prénom</label><input name="firstName" required /></div><div><label>Nom</label><input name="lastName" required /></div><div><label>Date de naissance</label><input name="birthDate" type="text" inputMode="numeric" placeholder="JJ/MM/AAAA" pattern="(?:0[1-9]|[12][0-9]|3[01])/(?:0[1-9]|1[0-2])/[0-9]{4}" maxLength={10} autoComplete="bday" required /></div><div><label>Nationalité</label><input name="nationality" defaultValue="Béninoise" required /></div><div><label>Identifiant fédéral</label><input name="federationId" placeholder="Optionnel" /></div><div><label>Poste</label><select name="position" defaultValue="MIDFIELDER"><option value="GOALKEEPER">Gardien</option><option value="DEFENDER">Défenseur</option><option value="MIDFIELDER">Milieu</option><option value="FORWARD">Attaquant</option></select></div><div><label>N° maillot</label><input name="shirtNumber" type="number" min="1" max="99" /></div><div><label>Entrée au club</label><input name="startDate" type="text" inputMode="numeric" placeholder="JJ/MM/AAAA" pattern="(?:0[1-9]|[12][0-9]|3[01])/(?:0[1-9]|1[0-2])/[0-9]{4}" maxLength={10} required /></div><button disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer le joueur'}</button>{formError && <div className="form-error">{formError}</div>}</form>}{message && <div className="success-message">{message}</div>}<RegistrationsView title="Effectif joueurs" registrations={registrations} profile="player" /></>;
}
function PlayerProfile({ registration, onChoosePhoto }: { registration: Registration; onChoosePhoto: () => void }) { const fullName = `${registration.person.firstName} ${registration.person.lastName}`; const initials = `${registration.person.firstName[0] ?? ''}${registration.person.lastName[0] ?? ''}`.toUpperCase(); return <article className="player-profile"><section className="player-profile-photo">{registration.person.photoDataUrl ? <img src={registration.person.photoDataUrl} alt={`Photo de ${fullName}`} /> : <div className="player-profile-placeholder">{initials}</div>}<button type="button" onClick={onChoosePhoto}>{registration.person.photoDataUrl ? 'Changer la photo' : 'Ajouter une photo'}</button></section><section className="player-profile-content"><div className="player-profile-heading"><div><label>FICHE JOUEUR</label><h2>{fullName}</h2><p>{registration.playerProfile?.position?.replaceAll('_', ' ') ?? 'Poste non renseigné'}{registration.playerProfile?.shirtNumber ? ` · N° ${registration.playerProfile.shirtNumber}` : ''}</p></div><Badge value={registration.status} /></div><div className="player-profile-grid"><ProfileField label="Identifiant fédéral" value={registration.person.federationId ?? 'Non renseigné'} /><ProfileField label="Nationalité" value={registration.person.nationality ?? 'Non renseignée'} /><ProfileField label="Date de naissance" value={registration.person.birthDate ? new Date(registration.person.birthDate).toLocaleDateString('fr-FR') : 'Non renseignée'} /><ProfileField label="Entrée au club" value={registration.startDate ? new Date(registration.startDate).toLocaleDateString('fr-FR') : 'Non renseignée'} /></div><div className="player-profile-summary"><div><span>Licences</span><strong>{registration.licenses?.length ?? 0}</strong></div><div><span>Documents</span><strong>{registration.documents?.length ?? 0}</strong></div></div></section></article>; }
function ProfileField({ label, value }: { label: string; value: string }) { return <div className="profile-field"><span>{label}</span><strong>{value}</strong></div>; }

function LicenseWorkflowView({ authority, licenses, clubs, token, onChanged }: { authority: Space; licenses: License[]; clubs: Organization[]; token: string; onChanged: () => void }) { const [selectedClub, setSelectedClub] = useState(''); const [busy, setBusy] = useState(''); const [message, setMessage] = useState(''); const [formError, setFormError] = useState(''); const filtered = selectedClub ? licenses.filter((license) => license.registration?.organizationId === selectedClub) : licenses; async function act(licenseId: string, action: 'transmit' | 'issue' | 'reject') { setBusy(licenseId); setFormError(''); setMessage(''); try { const body = action === 'reject' ? { reason: window.prompt('Motif du refus FBF') ?? '' } : undefined; if (action === 'reject' && !body?.reason) return; await request(`/licenses/${licenseId}/${action}`, token, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) }); setMessage('Décision enregistrée.'); onChanged(); } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Action impossible'); } finally { setBusy(''); } } return <section className="data-panel"><div className="title"><div><label>WORKFLOW LICENCES</label><h2>{authority === 'FEDERATION' ? 'Décisions FBF' : 'Validation Ligue'}</h2></div></div>{authority === 'LIGUE' && <div className="license-filter"><label>Club</label><select value={selectedClub} onChange={(event) => setSelectedClub(event.target.value)}><option value="">Tous les clubs</option>{clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select></div>}{formError && <div className="form-error">{formError}</div>}{message && <div className="success-message">{message}</div>}<div className="table-wrap"><table><thead><tr><th>Joueur</th><th>Saison</th><th>Statut</th><th>Décision</th></tr></thead><tbody>{filtered.map((license) => <tr key={license.id}><td><strong>{license.registration?.person.firstName} {license.registration?.person.lastName}</strong></td><td>{license.season}</td><td><Badge value={license.status} /></td><td>{authority === 'LIGUE' && license.status === 'LEAGUE_FAVORABLE' && <button disabled={busy === license.id} onClick={() => act(license.id, 'transmit')}>Transmettre FBF</button>}{authority === 'FEDERATION' && license.status === 'TRANSMITTED_TO_FBF' && <><button disabled={busy === license.id} onClick={() => act(license.id, 'issue')}>Délivrer</button> <button disabled={busy === license.id} onClick={() => act(license.id, 'reject')}>Refuser</button></>}</td></tr>)}</tbody></table>{!filtered.length && <div className="empty">Aucun dossier dans cette file.</div>}</div></section>; }
