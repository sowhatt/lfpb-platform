export type Space = 'FEDERATION' | 'LIGUE' | 'CLUB' | 'OFFICIEL';

export function resolveSpace(role: string): Space {
  if (role === 'FEDERATION_AGENT') return 'FEDERATION';
  if (role === 'CLUB_ADMIN') return 'CLUB';
  if (role === 'OFFICIEL') return 'OFFICIEL';
  return 'LIGUE';
}

export function navigationForSpace(space: Space): string[] {
  if (space === 'FEDERATION') return ['Vue d’ensemble', 'Licences'];
  if (space === 'CLUB') {
    return ['Vue d’ensemble', 'Effectif', 'Staff', 'Licences', 'Assistant IA', 'Calendrier'];
  }
  if (space === 'OFFICIEL') {
    return ['Vue d’ensemble', 'Mes rencontres', 'Assistant vocal', 'Stades'];
  }
  return [
    'Vue d’ensemble',
    'Compétitions',
    'Calendrier RKJO',
    'Clubs',
    'Licences',
    'Officiels',
    'Rencontres',
  ];
}
