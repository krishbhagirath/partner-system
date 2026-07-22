-- Adds editable profile fields and notification-preference toggles to User.
ALTER TABLE "User" ADD COLUMN "program" TEXT;
ALTER TABLE "User" ADD COLUMN "year" TEXT;
ALTER TABLE "User" ADD COLUMN "bio" TEXT;
ALTER TABLE "User" ADD COLUMN "notifyOnRequest" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifyOnMatch" BOOLEAN NOT NULL DEFAULT true;
