'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type Organization = { id: string; name: string; type: string };
type Registration = {
  organizationId?: string;
  person: { firstName: string; lastName: string };
};
type License = {
  id: string;
  number?: string | null;
  season: string;
  status: string;
  rejectionReason?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  registration?: Registration;
};

const STATUS_LABELS: Record<string, string> = {
  TRANSMITTED_TO_FBF: 'Transmis à la FBF — en attente de retour',
  ISSUED_BY_FBF: 'Licence délivrée par la FBF',
  REJECTED_BY_FBF: 'Refusé par la FBF',
};

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { message?: string }).message ?? `Erreur ${response.status}`);
  }
  return data as T;
}

function isoDate(value: FormDataEntryValue | null, label: string) {
  const raw = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) throw new Error(`${label} est obligatoire`);
  return raw;
}

export default function FbfReturnPage() {
  const [token, setToken] = useState('');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [selected, setSelected] = useState<License | null>(null);
  const [mode, setMode] = useState<'ISSUE' | 'REJECT' | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load(accessToken: string) {
    setLoading(true);
    setError('');
    try {
      const orgs = await request<Organization[]>('/organizations', accessToken);
      const clubs = orgs.filter((organization) => organization.type === 'CLUB');
      const lists = await Promise.all(
        clubs.map((club) =>
          request<License[]>(`/licenses?organizationId=${club.id}`, accessToken),
        ),
      );
      setOrganizations(orgs);
      setLicenses(lists.flat());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const savedToken = sessionStorage.getItem('lfpb-token') ?? '';
    setToken(savedToken);
    if (!savedToken) {
      setError('Connectez-vous d’abord à l’espace Ligue dans Digital Foot.');
      setLoading(false);
      return;
    }
    void load(savedToken);
  }, []);

  const visible = useMemo(
    () => licenses.filter((license) => ['TRANSMITTED_TO_FBF', 'ISSUED_BY_FBF', 'REJECTED_BY_FBF'].includes(license.status)),
    [licenses],
  );

  function clubName(license: License) {
    return organizations.find((organization) => organization.id === license.registration?.organizationId)?.name ?? 'Club';
  }

  async function submitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !token) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const validFrom = isoDate(form.get('validFrom'), 'La date de début');
      const validUntil = isoDate(form.get('validUntil'), 'La date de fin');
      await request(`/licenses/${selected.id}/federation-return`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          decision: 'ISSUED_BY_FBF',
          number: String(form.get('number') ?? '').trim(),
          validFrom,
          validUntil,
        }),
      });
      setMessage('Retour FBF enregistré : licence délivrée.');
      setSelected(null);
      setMode(null);
      await load(token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  async function submitReject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !token) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await request(`/licenses/${selected.id}/federation-return`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          decision: 'REJECTED_BY_FBF',
          reason: String(form.get('reason') ?? '').trim(),
        }),
      });
      setMessage('Retour FBF enregistré : dossier refusé.');
      setSelected(null);
      setMode(null);
      await load(token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <aside>
        <div className="brand"><b>LF</b><span><strong>LFPB</strong><small>Football professionnel</small></span></div>
        <div className="space-chip">ESPACE LIGUE</div>
        <div className="connected"><i /> Connecté à l’API</div>
        <nav>
          <button type="button" onClick={() => window.location.assign('/')}>⌂ Vue d’ensemble</button>
          <button type="button" onClick={() => window.location.assign('/')}>◫ Compétitions</button>
          <button type="button" onClick={() => window.location.assign('/')}>✦ Calendrier RKJO</button>
          <button type="button" onClick={() => window.location.assign('/')}>◆ Clubs</button>
          <button type="button" onClick={() => window.location.assign('/')}>◉ Licences</button>
          <button type="button" className="active">✓ Retours FBF</button>
          <button type="button" onClick={() => window.location.assign('/')}>⬡ Officiels</button>
          <button type="button" onClick={() => window.location.assign('/')}>◫ Rencontres</button>
        </nav>
        <div className="user"><b>LF</b><span><strong>Ligue</strong><small>Administration LFPB</small></span><button type="button" onClick={() => window.location.assign('/')}>↩</button></div>
      </aside>

      <main>
        <header>
          <div>
            <label>DONNÉES TEMPS RÉEL · API LFPB</label>
            <h1>Retours FBF</h1>
            <p>{loading ? 'Actualisation des dossiers…' : `${visible.length} dossier(s) fédéraux suivi(s)`}</p>
          </div>
          <div className="actions">
            <button type="button" onClick={() => token && void load(token)} disabled={loading}>↻ Actualiser</button>
            <button type="button" className="primary" onClick={() => window.location.assign('/')}>Retour à Digital Foot</button>
          </div>
        </header>

        <section className="workspace-actions">
          <div>
            <label>CONNECTEUR FBF V1</label>
            <h2>Retours de la Fédération</h2>
            <p>La FBF conserve sa propre application. La Ligue enregistre ici la décision reçue après transmission du dossier.</p>
          </div>
        </section>

        {error && <div className="api-error">{error}</div>}
        {message && <div className="success-message">{message}</div>}

        <section className="data-panel">
          <div className="title"><span><label>SUIVI FÉDÉRAL</label><h2>Dossiers transmis à la FBF</h2></span></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Joueur</th><th>Club</th><th>Saison</th><th>Statut</th><th>N° FBF</th><th>Action</th></tr>
              </thead>
              <tbody>
                {visible.map((license) => (
                  <tr key={license.id}>
                    <td><strong>{license.registration ? `${license.registration.person.firstName} ${license.registration.person.lastName}` : '—'}</strong></td>
                    <td>{clubName(license)}</td>
                    <td>{license.season}</td>
                    <td><span className={`badge ${license.status.toLowerCase()}`}>{STATUS_LABELS[license.status] ?? license.status}</span></td>
                    <td>{license.number ?? '—'}</td>
                    <td>
                      {license.status === 'TRANSMITTED_TO_FBF' ? (
                        <span className="row-actions">
                          <button type="button" onClick={() => { setSelected(license); setMode('ISSUE'); setError(''); setMessage(''); }}>Enregistrer une délivrance</button>
                          <button type="button" onClick={() => { setSelected(license); setMode('REJECT'); setError(''); setMessage(''); }}>Enregistrer un refus</button>
                        </span>
                      ) : 'Traité'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && visible.length === 0 && <div className="empty">Aucun dossier FBF à afficher.</div>}
          </div>
        </section>

        {selected && mode === 'ISSUE' && (
          <form onSubmit={submitIssue} className="entity-form">
            <div><label>Numéro officiel FBF *</label><input name="number" required minLength={3} maxLength={40} /></div>
            <div><label>Date de début de validité *</label><input name="validFrom" type="date" required /></div>
            <div><label>Date de fin de validité *</label><input name="validUntil" type="date" required /></div>
            <button disabled={busy}>{busy ? 'Enregistrement…' : 'Confirmer la délivrance'}</button>
            <button type="button" onClick={() => { setSelected(null); setMode(null); }}>Annuler</button>
          </form>
        )}

        {selected && mode === 'REJECT' && (
          <form onSubmit={submitReject} className="entity-form">
            <div style={{ gridColumn: '1 / span 3' }}><label>Motif officiel du refus *</label><input name="reason" required minLength={3} maxLength={500} /></div>
            <button disabled={busy}>{busy ? 'Enregistrement…' : 'Confirmer le refus'}</button>
            <button type="button" onClick={() => { setSelected(null); setMode(null); }}>Annuler</button>
          </form>
        )}
      </main>
    </div>
  );
}
