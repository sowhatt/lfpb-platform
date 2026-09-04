'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const DEFAULT_SEASON = '2026-2027';

type Registration = { id: string; organizationId?: string; status: string; person: { firstName: string; lastName: string; birthDate?: string; nationality?: string }; playerProfile?: { position: string; shirtNumber?: number } | null; documents?: { id: string; type: string; status: string }[] };
type License = { id: string; number?: string | null; season: string; status: string; validFrom?: string | null; validUntil?: string | null; rejectionReason?: string | null; registration?: Registration };
type ChecklistItem = { code: string; label: string; type: string; required: boolean; condition?: string; present: boolean; documentId?: string | null; status?: string | null };
type Checklist = { registrationId: string; totalRequired: number; completedRequired: number; complete: boolean; items: ChecklistItem[] };
type Props = { players: Registration[]; licenses: License[]; token: string; onChanged: () => Promise<void> };

const STATUS_LABELS: Record<string, string> = { DRAFT: 'Brouillon', SUBMITTED_TO_LEAGUE: 'Soumis à la LFPB', INCOMPLETE: 'Dossier à compléter', LEAGUE_FAVORABLE: 'Avis favorable LFPB', TRANSMITTED_TO_FBF: 'Transmis à la FBF', ISSUED_BY_FBF: 'Licence délivrée par la FBF', REJECTED_BY_FBF: 'Refusé par la FBF', SUSPENDED: 'Suspendue par la FBF', CANCELLED: 'Annulée par la FBF', EXPIRED: 'Expirée' };
const STATUS_ORDER = ['DRAFT', 'SUBMITTED_TO_LEAGUE', 'LEAGUE_FAVORABLE', 'TRANSMITTED_TO_FBF', 'ISSUED_BY_FBF'];
function labelStatus(value: string) { return STATUS_LABELS[value] ?? value.replaceAll('_', ' '); }
function formatDate(value?: string | null) { if (!value) return '—'; const date = new Date(value); if (Number.isNaN(date.getTime())) return '—'; return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date); }
async function request(path: string, token: string, init?: RequestInit) { const response = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers } }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error((data as { message?: string }).message ?? `Erreur ${response.status}`); return data; }

export function ClubLicenseWorkspace({ players, licenses, token, onChanged }: Props) {
  const [creating, setCreating] = useState(false); const [selected, setSelected] = useState<License | null>(null); const [season, setSeason] = useState(DEFAULT_SEASON); const [busy, setBusy] = useState(''); const [message, setMessage] = useState(''); const [messageIsError, setMessageIsError] = useState(false); const [checklist, setChecklist] = useState<Checklist | null>(null); const [checklistLoading, setChecklistLoading] = useState(false);
  const normalizedSeason = season.trim();
  const licensedIdsForSeason = new Set(licenses.filter((license) => license.season.trim() === normalizedSeason).map((license) => license.registration?.id).filter(Boolean));
  const availablePlayers = players.filter((player) => !licensedIdsForSeason.has(player.id));

  useEffect(() => { if (!selected?.registration?.id) { setChecklist(null); return; } let active = true; setChecklistLoading(true); request(`/license-documents/${selected.registration.id}/checklist`, token).then((data) => { if (active) setChecklist(data as Checklist); }).catch((reason) => { if (active) { setMessageIsError(true); setMessage(reason instanceof Error ? reason.message : 'Checklist indisponible'); } }).finally(() => { if (active) setChecklistLoading(false); }); return () => { active = false; }; }, [selected?.registration?.id, token]);

  async function createLicense(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const requestedSeason = String(form.get('season') ?? '').trim(); setBusy('create'); setMessage(''); setMessageIsError(false); try { await request('/licenses', token, { method: 'POST', body: JSON.stringify({ registrationId: form.get('registrationId'), season: requestedSeason }) }); setCreating(false); setMessage('Dossier de licence créé en brouillon.'); await onChanged(); } catch (reason) { setMessageIsError(true); setMessage(reason instanceof Error ? reason.message : 'Création impossible'); } finally { setBusy(''); } }
  async function uploadDocument(item: ChecklistItem, file?: File) { if (!selected?.registration?.id || !file) return; setBusy(`upload-${item.code}`); setMessage(''); setMessageIsError(false); try { const form = new FormData(); form.append('file', file); const response = await fetch(`${API}/license-documents/${selected.registration.id}/upload?itemCode=${encodeURIComponent(item.code)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error((data as { message?: string }).message ?? `Erreur ${response.status}`); setChecklist((data as { checklist: Checklist }).checklist); setMessage(`Pièce « ${item.label} » déposée avec succès.`); await onChanged(); } catch (reason) { setMessageIsError(true); setMessage(reason instanceof Error ? reason.message : 'Dépôt impossible'); } finally { setBusy(''); } }
  async function openDocument(documentId?: string | null) {
    if (!documentId) return;

    setMessage('');
    setMessageIsError(false);

    const targetWindow = window.open('', '_blank');

    try {
      const response = await fetch(
        `${API}/license-documents/document/${documentId}/file`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          (data as { message?: string }).message ??
            `Ouverture impossible (${response.status})`,
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (targetWindow) {
        targetWindow.location.href = url;
      } else {
        window.location.href = url;
      }

      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (reason) {
      targetWindow?.close();
      setMessageIsError(true);
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Ouverture du document impossible',
      );
    }
  }
  async function submit(license: License) { if (!['DRAFT', 'INCOMPLETE'].includes(license.status)) return; if (!checklist?.complete) { setMessageIsError(true); setMessage('Dossier incomplet : toutes les pièces réglementaires obligatoires doivent être déposées avant soumission.'); return; } if (!window.confirm('Soumettre ce dossier à la LFPB ? Après soumission, le club ne pourra plus le modifier librement.')) return; setBusy(license.id); setMessage(''); setMessageIsError(false); try { await request(`/licenses/${license.id}/submit`, token, { method: 'PATCH' }); setSelected(null); setMessage('Dossier soumis à la LFPB avec succès.'); await onChanged(); } catch (reason) { setMessageIsError(true); setMessage(reason instanceof Error ? reason.message : 'Soumission impossible'); } finally { setBusy(''); } }
  function progressIndex(status: string) { if (status === 'INCOMPLETE') return 1; if (status === 'REJECTED_BY_FBF') return 3; if (status === 'SUSPENDED' || ['CANCELLED', 'EXPIRED'].includes(status)) return 4; return Math.max(0, STATUS_ORDER.indexOf(status)); }

  return <>
    <section className="workspace-actions"><div><label>LICENCES DU CLUB</label><h2>Dossiers joueurs</h2><p>Créez les dossiers, contrôlez les pièces réglementaires et suivez le circuit LFPB → FBF.</p></div><button className="primary" type="button" onClick={() => { setCreating((value) => !value); setSelected(null); }}>{creating ? 'Fermer' : '+ Nouveau dossier'}</button></section>
    {message && <div className={messageIsError ? 'api-error' : 'success-message'}>{message}</div>}
    {creating && <form className="entity-form" onSubmit={createLicense}><div><label>Joueur *</label><select name="registrationId" required defaultValue=""><option value="" disabled>Choisir un joueur</option>{availablePlayers.map((player) => <option key={player.id} value={player.id}>{player.person.firstName} {player.person.lastName}</option>)}</select></div><div><label>Saison *</label><input name="season" value={season} onChange={(event) => setSeason(event.target.value)} required maxLength={20} /></div><div><label>Numéro FBF</label><input value="Attribué uniquement par la FBF" disabled /></div><button disabled={busy === 'create' || availablePlayers.length === 0 || !normalizedSeason}>{busy === 'create' ? 'Création…' : availablePlayers.length === 0 ? `Tous les joueurs ont un dossier ${normalizedSeason || ''}` : 'Créer le dossier'}</button></form>}

    {selected && <section className="player-profile"><button className="profile-close" type="button" onClick={() => setSelected(null)}>Fermer ×</button><div className="player-photo"><span>LF</span><small style={{ color: '#6f7e8d', textAlign: 'center' }}>Dossier officiel de licence</small></div><div className="player-identity"><label>FICHE LICENCE</label><h2>{selected.registration ? `${selected.registration.person.firstName} ${selected.registration.person.lastName}` : 'Dossier licence'}</h2><dl><div><dt>Saison</dt><dd>{selected.season}</dd></div><div><dt>Statut</dt><dd><span className={`badge ${selected.status.toLowerCase()}`}>{labelStatus(selected.status)}</span></dd></div><div><dt>Numéro FBF</dt><dd>{selected.number ?? 'Non attribué'}</dd></div><div><dt>Validité du</dt><dd>{formatDate(selected.validFrom)}</dd></div><div><dt>Validité au</dt><dd>{formatDate(selected.validUntil)}</dd></div><div><dt>Motif / complément</dt><dd>{selected.rejectionReason ?? '—'}</dd></div></dl>
      <div style={{ marginTop: 24 }}><label style={{ display: 'block', marginBottom: 10 }}>SUIVI DU DOSSIER</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{['Brouillon', 'LFPB', 'Avis favorable', 'FBF', 'Délivrée'].map((step, index) => <span key={step} style={{ padding: '8px 10px', borderRadius: 18, background: index <= progressIndex(selected.status) ? '#e7f4ec' : '#eef2f4', color: index <= progressIndex(selected.status) ? '#27704d' : '#71808e', fontSize: 10, fontWeight: 800 }}>{index + 1}. {step}</span>)}</div></div>
      <div style={{ marginTop: 28 }}><label style={{ display: 'block' }}>PIÈCES RÉGLEMENTAIRES</label><h3 style={{ margin: '6px 0' }}>{checklistLoading ? 'Chargement…' : checklist ? `${checklist.completedRequired} / ${checklist.totalRequired} pièces obligatoires déposées` : 'Checklist indisponible'}</h3>{checklist && <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>{checklist.items.map((item) => <div key={item.code} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', border: '1px solid #dfe7ec', borderRadius: 10, padding: 12, background: item.present ? '#f1f8f4' : '#fff' }}><div><strong>{item.present ? '✓ ' : '□ '}{item.label}</strong><div style={{ fontSize: 11, color: '#71808e', marginTop: 3 }}>{item.required ? 'Obligatoire' : item.condition ?? 'Conditionnelle'}{item.status ? ` · ${item.status}` : ''}</div></div><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
  {item.present && item.documentId && (
    <button
      type="button"
      onClick={() => void openDocument(item.documentId)}
      style={{
        border: '1px solid #c8d4dc',
        borderRadius: 7,
        padding: '7px 10px',
        fontSize: 11,
        fontWeight: 800,
        background: '#fff',
        cursor: 'pointer',
      }}
    >
      Ouvrir
    </button>
  )}
  {['DRAFT', 'INCOMPLETE'].includes(selected.status) && (
    <label style={{ cursor: 'pointer', border: '1px solid #c8d4dc', borderRadius: 7, padding: '7px 10px', fontSize: 11, fontWeight: 800 }}>
      {busy === `upload-${item.code}` ? 'Dépôt…' : item.present ? 'Remplacer' : 'Déposer'}
      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        hidden
        disabled={Boolean(busy)}
        onChange={(event) => {
          const file = event.target.files?.[0];
          void uploadDocument(item, file);
          event.currentTarget.value = '';
        }}
      />
    </label>
  )}
</div></div>)}</div>}
      {checklist && !checklist.complete && <div className="api-error" style={{ marginTop: 14 }}>Soumission bloquée : déposez toutes les pièces obligatoires du dossier.</div>}</div>
      {['DRAFT', 'INCOMPLETE'].includes(selected.status) && <button type="button" disabled={busy === selected.id || !checklist?.complete} onClick={() => submit(selected)} style={{ marginTop: 24, border: 0, borderRadius: 8, padding: '0.8rem 1rem', background: checklist?.complete ? '#0d3150' : '#9aa8b3', color: '#fff', fontWeight: 800 }}>{busy === selected.id ? 'Soumission…' : selected.status === 'INCOMPLETE' ? 'Resoumettre à la LFPB' : 'Soumettre à la LFPB'}</button>}
      </div></section>}

    <section className="data-panel"><div className="title"><span><label>DONNÉES RÉELLES</label><h2>Dossiers de licence du club</h2></span></div><div className="table-wrap">{licenses.length === 0 ? <div className="empty">Aucun dossier de licence enregistré</div> : <table><thead><tr><th>Joueur</th><th>Numéro FBF</th><th>Saison</th><th>Statut</th><th>Pièces</th><th>Action</th></tr></thead><tbody>{licenses.map((license) => <tr key={license.id} className="selectable-row" onClick={() => setSelected(license)}><td><button type="button" className="player-link" onClick={(event) => { event.stopPropagation(); setSelected(license); }}>{license.registration ? `${license.registration.person.firstName} ${license.registration.person.lastName}` : '—'}</button></td><td>{license.number ?? 'En attente FBF'}</td><td>{license.season}</td><td><span className={`badge ${license.status.toLowerCase()}`}>{labelStatus(license.status)}</span></td><td>{license.registration?.documents?.length ?? 0}</td><td><button type="button" onClick={(event) => { event.stopPropagation(); setSelected(license); }}>Voir la fiche</button></td></tr>)}</tbody></table>}</div></section>
  </>;
}
