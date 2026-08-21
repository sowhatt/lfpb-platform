'use client';

import { useState } from 'react';

const fixtures = [
  ['J1', '05 SEPT.', 'Dragons FC', 'RC Aziza', '16:00', 'Stade Charles de Gaulle'],
  ['J1', '06 SEPT.', 'Béké FC', 'Coton FC', '16:00', 'Stade de Bembèrèkè'],
  ['J2', '12 SEPT.', 'RC Aziza', 'Béké FC', '16:00', 'Stade René Pleven'],
];

export default function HomePage() {
  const [space, setSpace] = useState<'league' | 'club'>('league');
  const [active, setActive] = useState('Vue d’ensemble');
  const league = space === 'league';
  const nav = league
    ? ['Vue d’ensemble', 'Compétitions', 'Calendrier RKJO', 'Clubs', 'Licences', 'Stades', 'Officiels']
    : ['Vue d’ensemble', 'Mon effectif', 'Licences', 'Compositions', 'Calendrier', 'Documents'];
  const stats = league
    ? [['22', 'Clubs engagés', '+3 cette saison'], ['438', 'Licences actives', '31 à contrôler'], ['182', 'Rencontres', '6 cette semaine'], ['96%', 'Dossiers conformes', '+4,2 points']]
    : [['28', 'Joueurs', '24 licenciés'], ['9', 'Membres du staff', 'Tous actifs'], ['4', 'Dossiers en attente', 'Action requise'], ['3e', 'Classement Ligue 1', '7 points']];

  return (
    <div className="shell">
      <aside>
        <div className="brand"><b>LF</b><span><strong>LFPB</strong><small>Football professionnel</small></span></div>
        <div className="switch"><button className={league ? 'on' : ''} onClick={() => setSpace('league')}>Ligue</button><button className={!league ? 'on' : ''} onClick={() => setSpace('club')}>Mon club</button></div>
        <nav>{nav.map((item, i) => <button key={item} className={active === item ? 'active' : ''} onClick={() => setActive(item)}><i>{['⌂', '◫', '✦', '◆', '✓', '⬡', '♙'][i]}</i>{item}</button>)}</nav>
        <div className="user"><b>AK</b><span><strong>{league ? 'Alain K.' : 'Admin Dragons'}</strong><small>{league ? 'Administrateur Ligue' : 'Responsable club'}</small></span></div>
      </aside>

      <main>
        <header>
          <div><label>SAISON 2026–2027 · LIGUE 1</label><h1>{league ? 'Bonjour, Alain.' : 'Dragons FC de l’Ouémé'}</h1><p>{league ? 'Voici la situation du football professionnel aujourd’hui.' : 'Gérez votre effectif, vos licences et vos rencontres.'}</p></div>
          <div className="actions"><button>⌕</button><button>♢</button><button className="primary">{league ? '+ Nouvelle compétition' : '+ Ajouter un joueur'}</button></div>
        </header>

        <section className="stats">{stats.map(([value, label, detail], i) => <article key={label}><i className={`symbol s${i}`}>{['◆', '♙', '◫', '✓'][i]}</i><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</section>

        <section className="main-grid">
          <article className="panel fixtures">
            <div className="title"><span><label>CALENDRIER</label><h2>Prochaines rencontres</h2></span><button>Voir tout →</button></div>
            {fixtures.map(([day, date, home, away, time, venue]) => <div className="fixture" key={home + away}><b className="day">{day}<small>{date}</small></b><div className="teams"><span><i>D</i>{home}</span><em>VS</em><span><i className="green">A</i>{away}</span></div><div className="meta"><strong>{time}</strong><small>⌖ {venue}</small></div><button>•••</button></div>)}
          </article>

          <article className="planner"><div className="orbit">RKJO</div><label>PLANIFICATEUR INTELLIGENT</label><h2>Un calendrier équilibré, prêt à valider.</h2><p>Stades, repos des équipes et alternance domicile/extérieur analysés.</p><div className="score"><strong>100</strong><span>/100<br />Qualité excellente</span></div><button>Examiner la proposition</button></article>
        </section>

        <section className="bottom">
          <article className="panel"><div className="title"><span><label>DOSSIERS</label><h2>Licences à traiter</h2></span><b className="count">31</b></div><div className="progress"><i /></div><div className="legend"><span>● 18 en attente</span><span>● 5 incomplets</span><span>● 8 vérifiés</span></div></article>
          <article className="panel activity"><div className="title"><span><label>ACTIVITÉ</label><h2>Dernières actions</h2></span><button>Journal complet →</button></div><p><i>✓</i><span><strong>Licence approuvée</strong><small>Jean Adjovi · Dragons FC · il y a 12 min</small></span></p><p><i>✦</i><span><strong>Calendrier généré par RKJO</strong><small>Ligue 1 · qualité 100/100 · il y a 1 h</small></span></p></article>
        </section>
      </main>
    </div>
  );
}
