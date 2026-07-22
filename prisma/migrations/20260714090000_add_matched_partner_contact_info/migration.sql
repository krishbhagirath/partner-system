-- Optional contact details shown only to confirmed partner matches.
ALTER TABLE "User" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "User" ADD COLUMN "contactInstagram" TEXT;
ALTER TABLE "User" ADD COLUMN "contactOther" TEXT;
