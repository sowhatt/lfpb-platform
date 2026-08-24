-- A nullable key keeps historical registrations compatible while enforcing
-- uniqueness for every new player registration created by the application.
ALTER TABLE "Registration"
ADD COLUMN "deduplicationKey" TEXT;

CREATE UNIQUE INDEX "Registration_deduplicationKey_key"
ON "Registration"("deduplicationKey");
