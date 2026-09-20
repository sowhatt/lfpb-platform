ALTER TABLE "Person"
ADD COLUMN "identityKey" TEXT;

CREATE UNIQUE INDEX "Person_identityKey_key"
ON "Person"("identityKey");
