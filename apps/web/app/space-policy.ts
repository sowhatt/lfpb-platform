export type Space = "FEDERATION" | "LIGUE" | "CLUB" | "OFFICIEL";

export function resolveSpace(role: string): Space {
  if (role === "FEDERATION_AGENT") return "FEDERATION";
  if (role === "CLUB_ADMIN") return "CLUB";
  if (role === "OFFICIEL") return "OFFICIEL";
  return "LIGUE";
}

export function navigationForSpace(space: Space): string[] {
  if (space === "FEDERATION") return ["Vue d’ensemble", "Licences"];
  if (space === "CLUB") {
    return [
      "Vue d’ensemble",
      "Effectif",
      "Staff",
      "Transferts",
      "Licences",
      "Feuilles de match",
      "Assistant IA",
      "Calendrier",
    ];
  }
  if (space === "OFFICIEL") {
    return [
      "Accueil",
      "Mes missions",
      "Match du jour",
      "Rapports",
      "Historique",
      "Assistant vocal",
    ];
  }
  return [
    "Vue d’ensemble",
    "Calendrier officiel",
    "Calendrier assisté par IA",
    "Rencontres",
    "Classement & statistiques",
    "Homologation",
    "Clubs",
    "Joueurs",
    "Transferts",
    "Licences",
    "Retours FBF",
    "Officiels",
    "Désignations",
    "Référentiel compétitions",
  ];
}
