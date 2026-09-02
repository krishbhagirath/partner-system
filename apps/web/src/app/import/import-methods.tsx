"use client";

import { useState } from "react";

import { ImportFromMosaic } from "./import-from-mosaic";
import { ImportFromShareLink } from "./import-from-share-link";

/**
 * MacID / Mosaic (GCP scraper) import is disabled for now — the share-link import
 * is the only method shown. Flip this to `true` to bring back the "Prefer to log
 * in with MacID" option and the scraper wizard. Nothing below is deleted.
 */
const MACID_IMPORT_ENABLED = false;

/**
 * Two ways to import: the fast MyTimetable share-link path (no MacID password,
 * runs serverless) and the original MacID scraper wizard. Only one renders at a
 * time — each provides its own page chrome — so they never conflict.
 */
export function ImportMethods({
  existingSectionsCount,
  importedTerms,
}: {
  existingSectionsCount: number;
  importedTerms: string[];
}) {
  const [useMacId, setUseMacId] = useState(false);

  if (MACID_IMPORT_ENABLED && useMacId) {
    return <ImportFromMosaic existingSectionsCount={existingSectionsCount} />;
  }

  return (
    <ImportFromShareLink
      importedTerms={importedTerms}
      onUseMacId={MACID_IMPORT_ENABLED ? () => setUseMacId(true) : undefined}
    />
  );
}
