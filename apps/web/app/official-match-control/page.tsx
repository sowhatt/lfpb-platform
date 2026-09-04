'use client';

import { useEffect, useState } from 'react';
import { OfficialMatchPlayerControl } from '../official-match-player-control';

type Actor = {
  email: string;
  memberships: Array<{ organizationId: string; role: string }>;
};

export default function OfficialMatchControlPage() {
  const [token, setToken] = useState('');
  const [actor, setActor] = useState<Actor | null>(null);
  const [matchId, setMatchId] = useState('');

  useEffect(() => {
    setToken(sessionStorage.getItem('lfpb-token') ?? '');
    const raw = sessionStorage.getItem('lfpb-actor');
    if (raw) {
      try { setActor(JSON.parse(raw) as Actor); } catch { setActor(null); }
    }
    const params = new URLSearchParams(window.location.search);
    setMatchId(params.get('matchId') ?? '');
  }, []);

  const role = actor?.memberships?.[0]?.role;

  if (!token || !actor) {
    return <main style={{ maxWidth: 1100, margin: '32px auto', padding: 24 }}><section className="data-panel"><h1>Connected Match</h1><p>Connectez-vous d’abord à la plateforme LFPB.</p><a href="/">Retour à la connexion</a></section></main>;
  }

  if (role !== 'OFFICIEL') {
    return <main style={{ maxWidth: 1100, margin: '32px auto', padding: 24 }}><section className="data-panel"><h1>Connected Match</h1><p>Cette vue est réservée aux officiels.</p><a href="/">Retour au tableau de bord</a></section></main>;
  }

  if (!matchId) {
    return <main style={{ maxWidth: 1100, margin: '32px auto', padding: 24 }}><section className="data-panel"><h1>Connected Match</h1><p>Choisissez une rencontre depuis « Mes rencontres » pour lancer le contrôle des joueurs.</p><a href="/">Retour au portail officiel</a></section></main>;
  }

  return <main style={{ maxWidth: 1100, margin: '32px auto', padding: 24 }}><div className="workspace-actions"><div><label>PORTAIL OFFICIEL</label><h1>Connected Match</h1><p>{actor.email}</p></div><a href="/">← Retour au portail</a></div><OfficialMatchPlayerControl token={token} matchId={matchId} /></main>;
}
