'use client';

import { useEffect, useState } from 'react';
import { OfficialMissionsWorkspace } from '../official-missions-workspace';

type Actor = { memberships: { role: string }[] };

export default function OfficialMissionsPage() {
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const savedToken = sessionStorage.getItem('lfpb-token') ?? '';
    const savedActor = sessionStorage.getItem('lfpb-actor');
    if (!savedToken || !savedActor) {
      setError('Connectez-vous d’abord à Digital Foot avec votre compte officiel.');
      setReady(true);
      return;
    }
    const actor = JSON.parse(savedActor) as Actor;
    if (!actor.memberships.some((membership) => membership.role === 'OFFICIEL')) {
      setError('Cette page est réservée aux arbitres et officiels.');
      setReady(true);
      return;
    }
    setToken(savedToken);
    setReady(true);
  }, []);

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: 24 }}>
      <p style={{ marginBottom: 4 }}>LFPB · PORTAIL DES OFFICIELS</p>
      <h1>Mes désignations</h1>
      <p>Confirmez votre mission avant d’ouvrir la feuille de match.</p>
      {error && <div className="api-error" style={{ marginTop: 20 }}>{error}</div>}
      {ready && token && <div style={{ marginTop: 24 }}><OfficialMissionsWorkspace token={token} /></div>}
    </main>
  );
}
