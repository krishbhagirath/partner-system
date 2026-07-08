import type { Metadata } from "next";

import { requirePageUser } from "@/server/auth";
import { ImportFromMosaic } from "./import-from-mosaic";

export const metadata: Metadata = {
  title: "Import from Mosaic | LabPartner",
  description: "Import McMaster lab and tutorial sections from Mosaic into LabPartner.",
};

export default async function ImportPage() {
  await requirePageUser();

  return <ImportFromMosaic />;
}
