'use client';

import { useEffect, useState } from 'react';
import { OfficialMissionsWorkspace } from '../official-missions-workspace';

type Actor = {
  email?: string;
  memberships: Array<{ role: string }>;
};

export default function OfficialMissionsPage() {
  const [token, setToken] = useState('');
  const [actor, setActor] = useState<Actor | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const savedToken = sessionStorage.getItem('lfpb-token') ?? '';
    const savedActor = sessionStorage.getItem('lfpb-actor');

    if (!savedToken || !savedActor) {
      setError(
        'Connectez-vous d’abord à Digital Foot avec votre compte officiel.',
      );
      setReady(true);
      return;
    }

    try {
      const parsedActor = JSON.parse(savedActor) as Actor;

      if (
        !parsedActor.memberships.some(
          (membership) => membership.role === 'OFFICIEL',
        )
      ) {
        setError('Cette page est réservée aux arbitres et officiels.');
        setReady(true);
        return;
      }

      setActor(parsedActor);
      setToken(savedToken);
    } catch {
      setError('Les informations de session sont invalides.');
    }

    setReady(true);
  }, []);

  return (
    <main className="portal-page portal-page-wide">
      <header className="workspace-actions portal-hero">
        <div>
          <label>LFPB · PORTAIL DES OFFICIELS</label>
          <h1>Mes désignations</h1>
          <p>
            Consultez vos missions, confirmez votre disponibilité et accédez
            ensuite au contrôle officiel de la rencontre.
          </p>
        </div>

        <div className="portal-hero-actions">
          {actor?.email && (
            <span className="portal-user-chip">{actor.email}</span>
          )}

          <a className="portal-back-link" href="/">
            ← Digital Foot
          </a>
        </div>
      </header>

      {error && (
        <section className="portal-message-section">
          <div className="api-error">{error}</div>
          <a className="portal-link-button" href="/">
            Retour à l’accueil
          </a>
        </section>
      )}

      {ready && token && (
        <section className="portal-content">
          <OfficialMissionsWorkspace token={token} />
        </section>
      )}
    </main>
  );
}
