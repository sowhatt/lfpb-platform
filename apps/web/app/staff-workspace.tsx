'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type StaffRegistration = {
  id: string;
  status: string;
  person: { firstName: string; lastName: string };
  staffProfile?: { function: string; qualification?: string } | null;
};

type Props = {
  registrations: StaffRegistration[];
  organizationId: string;
  token: string;
  onCreated: () => Promise<void>;
};

const STAFF_FUNCTIONS = [
  ['HEAD_COACH', 'Entraîneur principal'],
  ['ASSISTANT_COACH', 'Entraîneur adjoint'],
  ['GOALKEEPER_COACH', 'Entraîneur des gardiens'],
  ['FITNESS_COACH', 'Préparateur physique'],
  ['DOCTOR', 'Médecin'],
  ['PHYSIOTHERAPIST', 'Kinésithérapeute'],
  ['TEAM_MANAGER', 'Manager d’équipe'],
  ['OTHER', 'Autre fonction'],
] as const;

function translateFunction(value?: string) {
  return Object.fromEntries(STAFF_FUNCTIONS)[value ?? ''] ?? value ?? '—';
}

function statusLabel(value: string) {
  return ({
    DRAFT: 'Brouillon',
    SUBMITTED: 'Soumis à la Ligue',
    VALIDATED: 'Validé',
    SUSPENDED: 'Suspendu',
    ARCHIVED: 'Archivé',
  } as Record<string, string>)[value] ?? value.replaceAll('_', ' ');
}

async function request(path: string, token: string, init?: RequestInit) {
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
  return data;
}

export function StaffWorkspace({ registrations, organizationId, token, onCreated }: Props) {
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const submitting = useRef(false);

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const endDate = String(form.get('endDate') ?? '').trim();

    submitting.current = true;
    setSaving(true);
    setMessage('');
    setMessageIsError(false);

    try {
      await request('/registries/staff', token, {
        method: 'POST',
        body: JSON.stringify({
          organizationId,
          firstName: String(form.get('firstName') ?? '').trim(),
          lastName: String(form.get('lastName') ?? '').trim(),
          birthDate: form.get('birthDate'),
          nationality: String(form.get('nationality') ?? '').trim() || undefined,
          function: form.get('function'),
          qualification: String(form.get('qualification') ?? '').trim() || undefined,
          startDate: form.get('startDate'),
          endDate: endDate || undefined,
        }),
      });

      formElement.reset();
      setCreating(false);
      setMessage('Membre du staff ajouté avec succès.');
      await onCreated();
    } catch (reason) {
      setMessageIsError(true);
      setMessage(reason instanceof Error ? reason.message : 'Création impossible');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <section className="workspace-actions">
        <div>
          <label>GESTION DU STAFF</label>
          <h2>Staff technique et médical</h2>
          <p>Ajoutez les entraîneurs, membres du staff médical et responsables d’équipe du club.</p>
        </div>
        <button className="primary" type="button" onClick={() => setCreating((value) => !value)}>
          {creating ? 'Fermer' : '+ Ajouter un membre'}
        </button>
      </section>

      {message && <div className={messageIsError ? 'api-error' : 'success-message'}>{message}</div>}

      {creating && (
        <form className="entity-form" onSubmit={createStaff}>
          <div><label>Prénom *</label><input name="firstName" required maxLength={80} /></div>
          <div><label>Nom *</label><input name="lastName" required maxLength={80} /></div>
          <div><label>Date de naissance *</label><input name="birthDate" type="date" required /></div>
          <div><label>Nationalité</label><input name="nationality" defaultValue="Béninoise" maxLength={80} /></div>
          <div><label>Fonction *</label><select name="function" required defaultValue="HEAD_COACH">{STAFF_FUNCTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></div>
          <div><label>Qualification / niveau</label><input name="qualification" maxLength={160} placeholder="Ex. Licence A CAF" /></div>
          <div><label>Date d’arrivée *</label><input name="startDate" type="date" required /></div>
          <div><label>Date de fin</label><input name="endDate" type="date" /></div>
          <button disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer le membre'}</button>
        </form>
      )}

      <section className="data-panel">
        <div className="title"><span><label>DONNÉES RÉELLES</label><h2>Staff technique et médical</h2></span></div>
        <div className="table-wrap">
          {registrations.length === 0 ? (
            <div className="empty">Aucune donnée enregistrée</div>
          ) : (
            <table>
              <thead><tr><th>Nom</th><th>Fonction</th><th>Qualification / niveau</th><th>Statut</th></tr></thead>
              <tbody>{registrations.map((registration) => <tr key={registration.id}><td><strong>{registration.person.firstName} {registration.person.lastName}</strong></td><td>{translateFunction(registration.staffProfile?.function)}</td><td>{registration.staffProfile?.qualification ?? '—'}</td><td><span className={`badge ${registration.status.toLowerCase()}`}>{statusLabel(registration.status)}</span></td></tr>)}</tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
