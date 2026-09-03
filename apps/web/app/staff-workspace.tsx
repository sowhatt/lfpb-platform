'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type StaffRegistration = {
  id: string;
  status: string;
  startDate: string;
  endDate?: string | null;
  person: {
    firstName: string;
    lastName: string;
    birthDate: string;
    nationality?: string | null;
  };
  staffProfile?: { function: string; qualification?: string | null } | null;
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

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

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

function normalizeIsoDate(value?: string | null) {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function toIsoDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  let day: number;
  let month: number;
  let year: number;
  const french = trimmed.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (french) {
    day = Number(french[1]);
    month = Number(french[2]);
    year = Number(french[3]);
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    return '';
  }

  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatFrenchDate(iso: string) {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function SmartDateField({ name, birthDate = false, initialValue = '' }: { name: string; birthDate?: boolean; initialValue?: string }) {
  const today = new Date();
  const initialIso = normalizeIsoDate(initialValue);
  const initialDate = initialIso ? new Date(`${initialIso}T00:00:00`) : today;
  const [displayValue, setDisplayValue] = useState(initialIso ? formatFrenchDate(initialIso) : '');
  const [isoValue, setIsoValue] = useState(initialIso);
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<'calendar' | 'months' | 'years'>('calendar');
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  const minYear = birthDate ? today.getFullYear() - 100 : today.getFullYear() - 5;
  const maxYear = birthDate ? today.getFullYear() : today.getFullYear() + 15;
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index);
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const mondayOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  function changeText(value: string) {
    setDisplayValue(value);
    const parsed = toIsoDate(value);
    setIsoValue(parsed);
    if (parsed) {
      const [year, month] = parsed.split('-').map(Number);
      setViewYear(year);
      setViewMonth(month - 1);
    }
  }

  function selectDay(day: number) {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setIsoValue(iso);
    setDisplayValue(formatFrenchDate(iso));
    setOpen(false);
    setPanel('calendar');
  }

  function moveMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    const nextYear = next.getFullYear();
    if (nextYear < minYear || nextYear > maxYear) return;
    setViewYear(nextYear);
    setViewMonth(next.getMonth());
  }

  const buttonStyle = { border: 0, background: 'transparent', cursor: 'pointer', padding: '0.35rem 0.45rem', borderRadius: 6 } as const;

  return (
    <div style={{ position: 'relative' }}>
      <input type="hidden" name={name} value={isoValue} />
      <div style={{ position: 'relative' }}>
        <input
          value={displayValue}
          onChange={(event) => changeText(event.target.value)}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData('text');
            if (pasted) {
              event.preventDefault();
              changeText(pasted);
            }
          }}
          placeholder="JJ/MM/AAAA"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Date"
          style={{ paddingRight: '2.8rem' }}
        />
        <button
          type="button"
          aria-label="Ouvrir le calendrier"
          title="Choisir dans le calendrier"
          onClick={() => setOpen((value) => !value)}
          style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', cursor: 'pointer', fontSize: '1rem', padding: '0.35rem' }}
        >
          📅
        </button>
      </div>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, width: 292, background: '#fff', border: '1px solid #d9e1e8', borderRadius: 12, boxShadow: '0 14px 34px rgba(11, 42, 67, 0.18)', padding: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr 34px', alignItems: 'center', marginBottom: 8 }}>
            <button type="button" onClick={() => moveMonth(-1)} style={buttonStyle}>‹</button>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
              <button type="button" onClick={() => setPanel('months')} style={{ ...buttonStyle, fontWeight: 700 }}>{MONTH_NAMES[viewMonth]}</button>
              <button type="button" onClick={() => setPanel('years')} style={{ ...buttonStyle, fontWeight: 700 }}>{viewYear}</button>
            </div>
            <button type="button" onClick={() => moveMonth(1)} style={buttonStyle}>›</button>
          </div>

          {panel === 'calendar' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontSize: 11, fontWeight: 700, opacity: 0.65, marginBottom: 4 }}>
                {['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'].map((day) => <span key={day}>{day}</span>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {Array.from({ length: mondayOffset }, (_, index) => <span key={`blank-${index}`} />)}
                {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
                  const candidate = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const selected = candidate === isoValue;
                  return (
                    <button
                      type="button"
                      key={day}
                      onClick={() => selectDay(day)}
                      style={{ ...buttonStyle, height: 34, background: selected ? '#0c3554' : 'transparent', color: selected ? '#fff' : 'inherit', fontWeight: selected ? 700 : 500 }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {panel === 'months' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {MONTH_NAMES.map((month, index) => (
                <button
                  type="button"
                  key={month}
                  onClick={() => { setViewMonth(index); setPanel('calendar'); }}
                  style={{ ...buttonStyle, padding: '0.65rem 0.35rem', background: index === viewMonth ? '#f1f5f8' : 'transparent', fontWeight: index === viewMonth ? 700 : 500 }}
                >
                  {month.slice(0, 4)}
                </button>
              ))}
            </div>
          )}

          {panel === 'years' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, maxHeight: 230, overflowY: 'auto', paddingRight: 2 }}>
              {years.map((year) => (
                <button
                  type="button"
                  key={year}
                  onClick={() => { setViewYear(year); setPanel('calendar'); }}
                  style={{ ...buttonStyle, padding: '0.55rem 0.25rem', background: year === viewYear ? '#0c3554' : 'transparent', color: year === viewYear ? '#fff' : 'inherit', fontWeight: year === viewYear ? 700 : 500 }}
                >
                  {year}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid #edf1f4' }}>
            <button type="button" onClick={() => { setDisplayValue(''); setIsoValue(''); setOpen(false); }} style={buttonStyle}>Effacer</button>
            <button type="button" onClick={() => setOpen(false)} style={{ ...buttonStyle, fontWeight: 700 }}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function readSmartDate(form: FormData, name: string, required: boolean) {
  const value = String(form.get(name) ?? '').trim();
  if (!value && !required) return undefined;
  if (!value) throw new Error('Veuillez renseigner les dates obligatoires au format JJ/MM/AAAA ou avec le calendrier.');
  return value;
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
  const [editing, setEditing] = useState<StaffRegistration | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const submitting = useRef(false);
  const formOpen = creating || Boolean(editing);

  function closeForm() {
    setCreating(false);
    setEditing(null);
  }

  function startCreate() {
    setEditing(null);
    setCreating(true);
    setMessage('');
  }

  function startEdit(registration: StaffRegistration) {
    setCreating(false);
    setEditing(registration);
    setMessage('');
  }

  async function saveStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    submitting.current = true;
    setSaving(true);
    setMessage('');
    setMessageIsError(false);

    try {
      const birthDate = readSmartDate(form, 'birthDate', true);
      const startDate = readSmartDate(form, 'startDate', true);
      const endDate = readSmartDate(form, 'endDate', false);
      const payload = {
        firstName: String(form.get('firstName') ?? '').trim(),
        lastName: String(form.get('lastName') ?? '').trim(),
        birthDate,
        nationality: String(form.get('nationality') ?? '').trim() || undefined,
        function: form.get('function'),
        qualification: String(form.get('qualification') ?? '').trim() || undefined,
        startDate,
        endDate,
      };

      if (editing) {
        await request(`/registries/staff/${editing.id}`, token, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setMessage('Membre du staff modifié avec succès.');
      } else {
        await request('/registries/staff', token, {
          method: 'POST',
          body: JSON.stringify({ organizationId, ...payload }),
        });
        setMessage('Membre du staff ajouté avec succès.');
      }

      closeForm();
      await onCreated();
    } catch (reason) {
      setMessageIsError(true);
      setMessage(reason instanceof Error ? reason.message : 'Enregistrement impossible');
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
          <p>Ajoutez et mettez à jour les entraîneurs, membres du staff médical et responsables d’équipe du club.</p>
        </div>
        <button className="primary" type="button" onClick={formOpen ? closeForm : startCreate}>
          {formOpen ? 'Fermer' : '+ Ajouter un membre'}
        </button>
      </section>

      {message && <div className={messageIsError ? 'api-error' : 'success-message'}>{message}</div>}

      {formOpen && (
        <form key={editing?.id ?? 'new'} className="entity-form" onSubmit={saveStaff}>
          <div><label>Prénom *</label><input name="firstName" required maxLength={80} defaultValue={editing?.person.firstName ?? ''} /></div>
          <div><label>Nom *</label><input name="lastName" required maxLength={80} defaultValue={editing?.person.lastName ?? ''} /></div>
          <div><label>Date de naissance *</label><SmartDateField name="birthDate" birthDate initialValue={editing?.person.birthDate} /></div>
          <div><label>Nationalité</label><input name="nationality" defaultValue={editing?.person.nationality ?? 'Béninoise'} maxLength={80} /></div>
          <div><label>Fonction *</label><select name="function" required defaultValue={editing?.staffProfile?.function ?? 'HEAD_COACH'}>{STAFF_FUNCTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></div>
          <div><label>Qualification / niveau</label><input name="qualification" maxLength={160} placeholder="Ex. Licence A CAF" defaultValue={editing?.staffProfile?.qualification ?? ''} /></div>
          <div><label>Date d’arrivée *</label><SmartDateField name="startDate" initialValue={editing?.startDate} /></div>
          <div><label>Date de fin</label><SmartDateField name="endDate" initialValue={editing?.endDate} /></div>
          <button disabled={saving}>{saving ? 'Enregistrement…' : editing ? 'Enregistrer les modifications' : 'Enregistrer le membre'}</button>
        </form>
      )}

      <section className="data-panel">
        <div className="title"><span><label>DONNÉES RÉELLES</label><h2>Staff technique et médical</h2></span></div>
        <div className="table-wrap">
          {registrations.length === 0 ? (
            <div className="empty">Aucune donnée enregistrée</div>
          ) : (
            <table>
              <thead><tr><th>Nom</th><th>Fonction</th><th>Qualification / niveau</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody>{registrations.map((registration) => <tr key={registration.id}><td><strong>{registration.person.firstName} {registration.person.lastName}</strong></td><td>{translateFunction(registration.staffProfile?.function)}</td><td>{registration.staffProfile?.qualification ?? '—'}</td><td><span className={`badge ${registration.status.toLowerCase()}`}>{statusLabel(registration.status)}</span></td><td><button type="button" onClick={() => startEdit(registration)} style={{ border: '1px solid #d8e0e7', background: '#fff', borderRadius: 8, padding: '0.45rem 0.7rem', cursor: 'pointer', fontWeight: 700 }}>Modifier</button></td></tr>)}</tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
