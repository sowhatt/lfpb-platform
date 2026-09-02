import assert from 'node:assert/strict';
import test from 'node:test';
import { voiceSyncSummary } from '../app/voice-sync-summary.ts';

test('la synchronisation complète affiche un résultat explicite', () => {
  assert.match(voiceSyncSummary(3, 3), /3 dictée\(s\) traitée\(s\)/);
});

test('les dictées non traitées restent annoncées comme conservées', () => {
  assert.match(voiceSyncSummary(3, 0), /3 dictée\(s\) conservée\(s\)/);
  assert.match(voiceSyncSummary(3, 2), /1 conservée\(s\)/);
});
