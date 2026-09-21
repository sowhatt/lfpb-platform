import assert from "node:assert/strict";
import test from "node:test";
import { navigationForSpace, resolveSpace } from "../app/space-policy.ts";

test("chaque rôle ouvre le bon espace", () => {
  assert.equal(resolveSpace("FEDERATION_AGENT"), "FEDERATION");
  assert.equal(resolveSpace("LIGUE_ADMIN"), "LIGUE");
  assert.equal(resolveSpace("CLUB_ADMIN"), "CLUB");
  assert.equal(resolveSpace("OFFICIEL"), "OFFICIEL");
});

test("les trois vues opérationnelles conservent leur navigation", () => {
  assert.deepEqual(navigationForSpace("CLUB"), [
    "Vue d’ensemble",
    "Effectif",
    "Staff",
    "Transferts",
    "Licences",
    "Feuilles de match",
    "Assistant IA",
    "Calendrier",
  ]);

  assert.deepEqual(navigationForSpace("OFFICIEL"), [
    "Vue d’ensemble",
    "Mes rencontres",
    "Assistant vocal",
    "Stades",
  ]);

  const leagueNavigation = navigationForSpace("LIGUE");

  assert.ok(leagueNavigation.includes("Clubs"));
  assert.ok(leagueNavigation.includes("Transferts"));
  assert.ok(leagueNavigation.includes("Officiels"));
  assert.ok(leagueNavigation.includes("Homologation"));
  assert.ok(leagueNavigation.includes("Classement & statistiques"));

  assert.ok(
    leagueNavigation.indexOf("Homologation") <
      leagueNavigation.indexOf("Classement & statistiques"),
  );

  assert.ok(
    leagueNavigation.indexOf("Classement & statistiques") <
      leagueNavigation.indexOf("Clubs"),
  );
});
