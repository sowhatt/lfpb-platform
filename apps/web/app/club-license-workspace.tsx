'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const DEFAULT_SEASON = '2026-2027';

type Registration = {
  id: string;
  organizationId?: string;
  status: string;
  person: { firstName: string; lastName: string; birthDate?: string; nationality?: string };
  playerProfile?: { position: string; shirtNumber?: number } | null;
  documents?: { id: string; type: string; status: string }[];
};

type License = {
  id: string;
  number?: string | null;
  season: string;
  status: string;
  validFrom?: string | null;
  validUntil?: string | null;
  rejectionReason?: string | null;
  registration?: Registration;
};

type Props = {
  players: Registration[];
  licenses: License[];
  token: string;
  onChanged: () => Promise<void>;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  SUBMITTED_TO_LEAGUE: 'Soumis à la LFPB',
  INCOMPLETE: 'Dossier à compléter',
  LEAGUE_FAVORABLE: 'Avis favorable LFPB',
  TRANSMITTED_TO_FBF: 'Transmis à la FBF',
  ISSUED_BY_FBF: 'Licence délivrée par la FBF',
  REJECTED_BY_FBF: 'Refusé par la FBF',
  SUSPENDED: 'Suspendue par la FBF',
  CANCELLED: 'Annulée par la FBF',
  EXPIRED: 'Expirée',
};

const STATUS_ORDER = ['DRAFT', 'SUBMITTED_TO_LEAGUE', 'LEAGUE_FAVORABLE', 'TRANSMITTED_TO_FBF', 'ISSUED_BY_FBF'];

function labelStatus(value: string) { return STATUS_LABELS[value] ?? value.replaceAll('_', ' '); }
function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

async function request(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { message?: string }).message ?? `Erreur ${response.status}`);
  return data;
}

export function ClubLicenseWorkspace({ players, licenses, token, onChanged }: Props) {
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<License | null>(null);
  const [season, setSeason] = useState(DEFAULT_SEASON);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);

  const normalizedSeason = season.trim();
  const licensedIdsForSeason = new Set(
    licenses
      .filter((license) => license.season.trim() === normalizedSeason)
      .map((license) => license.registration?.id)
      .filter(Boolean),
  );
  const availablePlayers = players.filter((player) => !licensedIdsForSeason.has(player.id));

  async function createLicense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const requestedSeason = String(form.get('season') ?? '').trim();
    setBusy('create'); setMessage(''); setMessageIsError(false);
    try {
      await request('/licenses', token, {
        method: 'POST',
        body: JSON.stringify({ registrationId: form.get('registrationId'), season: requestedSeason }),
      });
      setCreating(false);
      setMessage('Dossier de licence créé en brouillon.');
      await onChanged();
    } catch (reason) {
      setMessageIsError(true);
      setMessage(reason instanceof Error ? reason.message : 'Création impossible');
    } finally { setBusy(''); }
  }

  async function submit(license: License) {
    if (!['DRAFT', 'INCOMPLETE'].includes(license.status)) return;
    if (!window.confirm('Soumettre ce dossier à la LFPB ? Après soumission, le club ne pourra plus le modifier librement.')) return;
    setBusy(license.id); setMessage(''); setMessageIsError(false);
    try {
      await request(`/licenses/${license.id}/submit`, token, { method: 'PATCH' });
      setSelected(null);
      setMessage('Dossier soumis à la LFPB avec succès.');
      await onChanged();
    } catch (reason) {
      setMessageIsError(true);
      setMessage(reason instanceof Error ? reason.message : 'Soumission impossible');
    } finally { setBusy(''); }
  }

  function progressIndex(status: string) {
    if (status === 'INCOMPLETE') return 1;
    if (status === 'REJECTED_BY_FBF') return 3;
    if (status === 'SUSPENDED') return 4;
    if (['CANCELLED', 'EXPIRED'].includes(status)) return 4;
    return Math.max(0, STATUS_ORDER.indexOf(status));
  }

  return <>
    <section className="workspace-actions">
      <div><label>LICENCES DU CLUB</label><h2>Dossiers joueurs</h2><p>Créez les dossiers, contrôlez leur état et suivez le circuit LFPB → FBF.</p></div>
      <button className="primary" type="button" onClick={() => { setCreating((value) => !value); setSelected(null); }}>{creating ? 'Fermer' : '+ Nouveau dossier'}</button>
    </section>

    {message && <div className={messageIsError ? 'api-error' : 'success-message'}>{message}</div>}

    {creating && <form className="entity-form" onSubmit={createLicense}>
      <div><label>Joueur *</label><select name="registrationId" required defaultValue=""><option value="" disabled>Choisir un joueur</option>{availablePlayers.map((player) => <option key={player.id} value={player.id}>{player.person.firstName} {player.person.lastName}</option>)}</select></div>
      <div><label>Saison *</label><input name="season" value={season} onChange={(event) => setSeason(event.target.value)} required maxLength={20} /></div>
      <div><label>Numéro FBF</label><input value="Attribué uniquement par la FBF" disabled /></div>
      <button disabled={busy === 'create' || availablePlayers.length === 0 || !normalizedSeason}>{busy === 'create' ? 'Création…' : availablePlayers.length === 0 ? `Tous les joueurs ont un dossier ${normalizedSeason || ''}` : 'Créer le dossier'}</button>
    </form>}

    {selected && <section className="player-profile">
      <button className="profile-close" type="button" onClick={() => setSelected(null)}>Fermer ×</button>
      <div className="player-photo"><span>LF</span><small style={{ color: '#6f7e8d', textAlign: 'center' }}>Dossier officiel de licence</small></div>
      <div className="player-identity"><label>FICHE LICENCE</label><h2>{selected.registration ? `${selected.registration.person.firstName} ${selected.registration.person.lastName}` : 'Dossier licence'}</h2><dl>
        <div><dt>Saison</dt><dd>{selected.season}</dd></div>
        <div><dt>Statut</dt><dd><span className={`badge ${selected.status.toLowerCase()}`}>{labelStatus(selected.status)}</span></dd></div>
        <div><dt>Numéro FBF</dt><dd>{selected.number ?? 'Non attribué'}</dd></div>
        <div><dt>Pièces enregistrées</dt><dd>{selected.registration?.documents?.length ?? 0}</dd></div>
        <div><dt>Validité du</dt><dd>{formatDate(selected.validFrom)}</dd></div>
        <div><dt>Validité au</dt><dd>{formatDate(selected.validUntil)}</dd></div>
        <div><dt>Motif / complément</dt><dd>{selected.rejectionReason ?? '—'}</dd></div>
        <div><dt>Identifiant dossier</dt><dd style={{ fontFamily: 'monospace', fontSize: 12 }}>{selected.id}</dd></div>
      </dl>
      <div style={{ marginTop: 24 }}><label style={{ display: 'block', marginBottom: 10 }}>SUIVI DU DOSSIER</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{['Brouillon', 'LFPB', 'Avis favorable', 'FBF', 'Délivrée'].map((step, index) => <span key={step} style={{ padding: '8px 10px', borderRadius: 18, background: index <= progressIndex(selected.status) ? '#e7f4ec' : '#eef2f4', color: index <= progressIndex(selected.status) ? '#27704d' : '#71808e', fontSize: 10, fontWeight: 800 }}>{index + 1}. {step}</span>)}</div></div>
      {['DRAFT', 'INCOMPLETE'].includes(selected.status) && <button type="button" disabled={busy === selected.id} onClick={() => submit(selected)} style={{ marginTop: 24, border: 0, borderRadius: 8, padding: '0.8rem 1rem', background: '#0d3150', color: '#fff', fontWeight: 800 }}>{busy === selected.id ? 'Soumission…' : selected.status === 'INCOMPLETE' ? 'Resoumettre à la LFPB' : 'Soumettre à la LFPB'}</button>}
      </div>
    </section>}

    <section className="data-panel"><div className="title"><span><label>DONNÉES RÉELLES</label><h2>Dossiers de licence du club</h2></span></div><div className="table-wrap">
      {licenses.length === 0 ? <div className="empty">Aucun dossier de licence enregistré</div> : <table><thead><tr><th>Joueur</th><th>Numéro FBF</th><th>Saison</th><th>Statut</th><th>Pièces</th><th>Action</th></tr></thead><tbody>{licenses.map((license) => <tr key={license.id} className="selectable-row" onClick={() => setSelected(license)}><td><button type="button" className="player-link" onClick={(event) => { event.stopPropagation(); setSelected(license); }}>{license.registration ? `${license.registration.person.firstName} ${license.registration.person.lastName}` : '—'}</button></td><td>{license.number ?? 'En attente FBF'}</td><td>{license.season}</td><td><span className={`badge ${license.status.toLowerCase()}`}>{labelStatus(license.status)}</span></td><td>{license.registration?.documents?.length ?? 0}</td><td><button type="button" onClick={(event) => { event.stopPropagation(); setSelected(license); }}>Voir la fiche</button></td></tr>)}</tbody></table>}
    </div></section>
  </>;
}
