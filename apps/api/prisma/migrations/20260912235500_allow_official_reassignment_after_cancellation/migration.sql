-- Historical assignments must remain auditable after cancellation/refusal.
-- Uniqueness applies only to active assignment states.
DROP INDEX IF EXISTS "MatchOfficialAssignment_matchId_role_key";
DROP INDEX IF EXISTS "MatchOfficialAssignment_matchId_officialProfileId_key";

CREATE UNIQUE INDEX "MatchOfficialAssignment_active_match_role_key"
ON "MatchOfficialAssignment" ("matchId", "role")
WHERE "status" IN ('DRAFT', 'SENT', 'ACCEPTED');

CREATE UNIQUE INDEX "MatchOfficialAssignment_active_match_official_key"
ON "MatchOfficialAssignment" ("matchId", "officialProfileId")
WHERE "status" IN ('DRAFT', 'SENT', 'ACCEPTED');
