'use client';

import { useEffect, useState } from 'react';
import { ClubAiAssistant } from '../club-ai-assistant';

type Actor = {
  email: string;
  memberships: Array<{ organizationId: string; role: string }>;
};

export default function ClubAiPage() {
  const [token, setToken] = useState('');
  const [actor, setActor] = useState<Actor | null>(null);

  useEffect(() => {
    const savedToken = sessionStorage.getItem('lfpb-token') ?? '';
    const savedActor = sessionStorage.getItem('lfpb-actor');
    setToken(savedToken);
    if (savedActor) {
      try {
        setActor(JSON.parse(savedActor) as Actor);
      } catch {
        setActor(null);
      }
    }
  }, []);

  const membership = actor?.memberships?.[0];

  if (!token || !membership) {
    return (
      <main style={{ maxWidth: 960, margin: '48px auto', padding: 24 }}>
        <section className="data-panel">
          <h1>Assistant IA du club</h1>
          <p>Connectez-vous d’abord à la plateforme LFPB, puis ouvrez de nouveau cette page.</p>
          <a href="/">Retour à la connexion</a>
        </section>
      </main>
    );
  }

  if (membership.role !== 'CLUB_ADMIN') {
    return (
      <main style={{ maxWidth: 960, margin: '48px auto', padding: 24 }}>
        <section className="data-panel">
          <h1>Assistant IA du club</h1>
          <p>Cette première version est réservée à l’espace CLUB.</p>
          <a href="/">Retour au tableau de bord</a>
        </section>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1100, margin: '32px auto', padding: 24 }}>
      <div className="workspace-actions">
        <div>
          <label>LF · RKJO AI</label>
          <h1>Recherche vocale joueur</h1>
          <p>{actor.email}</p>
        </div>
        <a href="/">← Tableau de bord</a>
      </div>
      <ClubAiAssistant token={token} organizationId={membership.organizationId} />
    </main>
  );
}
