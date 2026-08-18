const spaces = [
  ['Ligue', 'Compétitions, homologation et pilotage'],
  ['Clubs', 'Effectifs, licences et compositions'],
  ['Officiels', 'Désignations, feuille de match et rapports'],
];

export default function HomePage() {
  return (
    <main>
      <p className="eyebrow">Ligue de Football Professionnel du Bénin</p>
      <h1>Le football béninois, piloté numériquement.</h1>
      <p className="lead">
        Socle Sprint 0 : espaces sécurisés Ligue, clubs et officiels.
      </p>
      <section>
        {spaces.map(([title, description]) => (
          <article key={title}>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
