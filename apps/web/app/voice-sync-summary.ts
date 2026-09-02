export type VoiceSyncOutcome = 'synced' | 'retained';

export function voiceSyncSummary(total: number, synced: number): string {
  const retained = total - synced;
  if (synced === total) {
    return `Synchronisation terminée : ${synced} dictée(s) traitée(s). Vérifiez le dernier brouillon généré.`;
  }
  if (synced === 0) {
    return `Synchronisation impossible : ${retained} dictée(s) conservée(s) dans la file locale.`;
  }
  return `Synchronisation partielle : ${synced} dictée(s) traitée(s), ${retained} conservée(s) dans la file locale.`;
}
