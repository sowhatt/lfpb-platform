import assert from 'node:assert/strict';
import test from 'node:test';
import { navigationForSpace, resolveSpace } from '../app/space-policy.ts';

test('chaque rôle ouvre le bon espace', () => {
  assert.equal(resolveSpace('FEDERATION_AGENT'), 'FEDERATION');
  assert.equal(resolveSpace('LIGUE_ADMIN'), 'LIGUE');
  assert.equal(resolveSpace('CLUB_ADMIN'), 'CLUB');
  assert.equal(resolveSpace('OFFICIEL'), 'OFFICIEL');
});

test('les trois vues opérationnelles conservent leur navigation', () => {
  assert.deepEqual(navigationForSpace('CLUB'), [
    'Vue d’ensemble', 'Effectif', 'Staff', 'Licences', 'Calendrier',
  ]);
  assert.deepEqual(navigationForSpace('OFFICIEL'), [
    'Vue d’ensemble', 'Mes rencontres', 'Assistant vocal', 'Stades',
  ]);
  assert.ok(navigationForSpace('LIGUE').includes('Clubs'));
  assert.ok(navigationForSpace('LIGUE').includes('Officiels'));
});
