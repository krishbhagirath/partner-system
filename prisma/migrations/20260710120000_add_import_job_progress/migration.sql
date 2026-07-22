-- Persist scraper progress so the import page can show step-level status.
ALTER TABLE "ImportJob" ADD COLUMN "progressStage" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN "progressCurrent" INTEGER;
ALTER TABLE "ImportJob" ADD COLUMN "progressTotal" INTEGER;
