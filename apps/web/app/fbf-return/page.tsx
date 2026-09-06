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
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: 32, fontFamily: 'Arial, sans-serif' }}>
      <section style={{ marginBottom: 24 }}>
        <small style={{ fontWeight: 800, color: '#657789' }}>LFPB · CONNECTEUR FBF V1</small>
        <h1 style={{ margin: '8px 0' }}>Retours de la Fédération</h1>
        <p style={{ color: '#657789', maxWidth: 760 }}>
          La FBF conserve sa propre application. Cet écran permet à la Ligue d’enregistrer dans Digital Foot
          la décision reçue après transmission du dossier.
        </p>
        <button type="button" onClick={() => token && void load(token)} disabled={loading}>
          {loading ? 'Actualisation…' : '↻ Actualiser'}
        </button>
      </section>

      {error && <div style={{ padding: 12, background: '#fff0f0', borderRadius: 8, marginBottom: 16 }}>{error}</div>}
      {message && <div style={{ padding: 12, background: '#eef8f2', borderRadius: 8, marginBottom: 16 }}>{message}</div>}

      <section style={{ overflowX: 'auto', border: '1px solid #dfe7ec', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', background: '#f5f7f9' }}>
              <th style={{ padding: 12 }}>Joueur</th><th style={{ padding: 12 }}>Club</th><th style={{ padding: 12 }}>Saison</th><th style={{ padding: 12 }}>Statut</th><th style={{ padding: 12 }}>N° FBF</th><th style={{ padding: 12 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((license) => (
              <tr key={license.id} style={{ borderTop: '1px solid #e5ebef' }}>
                <td style={{ padding: 12, fontWeight: 700 }}>{license.registration ? `${license.registration.person.firstName} ${license.registration.person.lastName}` : '—'}</td>
                <td style={{ padding: 12 }}>{clubName(license)}</td>
                <td style={{ padding: 12 }}>{license.season}</td>
                <td style={{ padding: 12 }}>{STATUS_LABELS[license.status] ?? license.status}</td>
                <td style={{ padding: 12 }}>{license.number ?? '—'}</td>
                <td style={{ padding: 12 }}>
                  {license.status === 'TRANSMITTED_TO_FBF' ? (
                    <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => { setSelected(license); setMode('ISSUE'); setError(''); setMessage(''); }}>Enregistrer une délivrance</button>
                      <button type="button" onClick={() => { setSelected(license); setMode('REJECT'); setError(''); setMessage(''); }}>Enregistrer un refus</button>
                    </span>
                  ) : 'Traité'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && visible.length === 0 && <div style={{ padding: 24 }}>Aucun dossier FBF à afficher.</div>}
      </section>

      {selected && mode === 'ISSUE' && (
        <form onSubmit={submitIssue} style={{ marginTop: 24, padding: 20, border: '1px solid #dfe7ec', borderRadius: 12, display: 'grid', gap: 14, maxWidth: 680 }}>
          <div><small>RETOUR FBF · DÉLIVRANCE</small><h2 style={{ margin: '4px 0' }}>{selected.registration ? `${selected.registration.person.firstName} ${selected.registration.person.lastName}` : 'Licence'}</h2></div>
          <label>Numéro officiel FBF *<input name="number" required minLength={3} maxLength={40} style={{ display: 'block', width: '100%', marginTop: 5, padding: 10 }} /></label>
          <label>Date de début de validité *<input name="validFrom" type="date" required style={{ display: 'block', width: '100%', marginTop: 5, padding: 10 }} /></label>
          <label>Date de fin de validité *<input name="validUntil" type="date" required style={{ display: 'block', width: '100%', marginTop: 5, padding: 10 }} /></label>
          <div style={{ display: 'flex', gap: 8 }}><button disabled={busy}>{busy ? 'Enregistrement…' : 'Confirmer la délivrance'}</button><button type="button" onClick={() => { setSelected(null); setMode(null); }}>Annuler</button></div>
        </form>
      )}

      {selected && mode === 'REJECT' && (
        <form onSubmit={submitReject} style={{ marginTop: 24, padding: 20, border: '1px solid #dfe7ec', borderRadius: 12, display: 'grid', gap: 14, maxWidth: 680 }}>
          <div><small>RETOUR FBF · REFUS</small><h2 style={{ margin: '4px 0' }}>{selected.registration ? `${selected.registration.person.firstName} ${selected.registration.person.lastName}` : 'Licence'}</h2></div>
          <label>Motif officiel du refus *<textarea name="reason" required minLength={3} maxLength={500} rows={4} style={{ display: 'block', width: '100%', marginTop: 5, padding: 10 }} /></label>
          <div style={{ display: 'flex', gap: 8 }}><button disabled={busy}>{busy ? 'Enregistrement…' : 'Confirmer le refus'}</button><button type="button" onClick={() => { setSelected(null); setMode(null); }}>Annuler</button></div>
        </form>
      )}
    </main>
  );
}
