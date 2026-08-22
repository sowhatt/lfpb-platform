-- CreateEnum
CREATE TYPE "VenueAssignmentType" AS ENUM ('PRIMARY', 'ALTERNATE');

-- CreateTable
CREATE TABLE "ClubVenue" (
    "clubId" UUID NOT NULL,
    "venueId" UUID NOT NULL,
    "type" "VenueAssignmentType" NOT NULL DEFAULT 'ALTERNATE',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubVenue_pkey" PRIMARY KEY ("clubId","venueId")
);

-- CreateTable
CREATE TABLE "VenueUnavailability" (
    "id" UUID NOT NULL,
    "venueId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueUnavailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubVenue_venueId_active_idx" ON "ClubVenue"("venueId", "active");

-- CreateIndex
CREATE INDEX "ClubVenue_clubId_type_priority_idx" ON "ClubVenue"("clubId", "type", "priority");

-- CreateIndex
CREATE INDEX "VenueUnavailability_venueId_startsAt_endsAt_idx" ON "VenueUnavailability"("venueId", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "ClubVenue" ADD CONSTRAINT "ClubVenue_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubVenue" ADD CONSTRAINT "ClubVenue_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueUnavailability" ADD CONSTRAINT "VenueUnavailability_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
