import type { Metadata } from "next";

import { requirePageUser } from "@/server/auth";
import { countSectionsForUser } from "@/server/lab-partner";
import { ImportMethods } from "./import-methods";

export const metadata: Metadata = {
  title: "Import from Mosaic | PartnerUp",
  description: "Import McMaster lab and tutorial sections from Mosaic into PartnerUp.",
};

export default async function ImportPage() {
  const user = await requirePageUser();
  const existingSectionsCount = await countSectionsForUser(user.id);

  return <ImportMethods existingSectionsCount={existingSectionsCount} />;
}
