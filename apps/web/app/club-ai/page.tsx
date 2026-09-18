'use client';

import { useEffect, useState } from 'react';
import { ClubAiAssistant } from '../club-ai-assistant';

type Actor = {
  email: string;
  memberships: Array<{ organizationId: string; role: string }>;
};

function AccessScreen({
  title,
  message,
  actionLabel,
}: {
  title: string;
  message: string;
  actionLabel: string;
}) {
  return (
    <main className="portal-page">
      <section className="portal-access-card data-panel">
        <label className="portal-eyebrow">DIGITAL FOOT · CLUB</label>
        <h1>{title}</h1>
        <p>{message}</p>
        <a className="portal-link-button" href="/">
          {actionLabel}
        </a>
      </section>
    </main>
  );
}

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

  const membership = actor?.memberships?.find(
    (candidate) => candidate.role === 'CLUB_ADMIN',
  );

  if (!token || !actor) {
    return (
      <AccessScreen
        title="Assistant IA du club"
        message="Connectez-vous d’abord à Digital Foot pour accéder aux outils intelligents de votre club."
        actionLabel="← Retour à la connexion"
      />
    );
  }

  if (!membership) {
    return (
      <AccessScreen
        title="Accès réservé"
        message="L’assistant IA joueur est réservé aux administrateurs de club."
        actionLabel="← Retour au tableau de bord"
      />
    );
  }

  return (
    <main className="portal-page portal-page-wide">
      <header className="workspace-actions portal-hero">
        <div>
          <label>DIGITAL FOOT AI · ESPACE CLUB</label>
          <h1>Recherche vocale joueur</h1>
          <p>
            Recherche intelligente et accès rapide au référentiel de votre club.
          </p>
        </div>

        <div className="portal-hero-actions">
          <span className="portal-user-chip">{actor.email}</span>
          <a className="portal-back-link" href="/">
            ← Tableau de bord
          </a>
        </div>
      </header>

      <section className="portal-content">
        <ClubAiAssistant
          token={token}
          organizationId={membership.organizationId}
        />
      </section>
    </main>
  );
}
