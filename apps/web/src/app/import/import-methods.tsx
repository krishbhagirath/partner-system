"use client";

import { useState } from "react";

import { ImportFromMosaic } from "./import-from-mosaic";
import { ImportFromShareLink } from "./import-from-share-link";

/**
 * Two ways to import: the fast MyTimetable share-link path (no MacID password,
 * runs serverless) and the original MacID scraper wizard. Only one renders at a
 * time — each provides its own page chrome — so they never conflict.
 */
export function ImportMethods({ existingSectionsCount }: { existingSectionsCount: number }) {
  const [useMacId, setUseMacId] = useState(false);

  if (useMacId) {
    return <ImportFromMosaic existingSectionsCount={existingSectionsCount} />;
  }

  return <ImportFromShareLink onUseMacId={() => setUseMacId(true)} />;
}
