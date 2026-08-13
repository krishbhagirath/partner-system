import type { Metadata } from "next";

import { requirePageUser } from "@/server/auth";
import { countSectionsForUser, listTermsForUser } from "@/server/lab-partner";
import { ImportMethods } from "./import-methods";

export const metadata: Metadata = {
  title: "Import your schedule | PartnerUp",
  description: "Import McMaster lab and tutorial sections into PartnerUp.",
};

export default async function ImportPage() {
  const user = await requirePageUser();
  const [existingSectionsCount, importedTerms] = await Promise.all([
    countSectionsForUser(user.id),
    listTermsForUser(user.id),
  ]);

  return (
    <ImportMethods existingSectionsCount={existingSectionsCount} importedTerms={importedTerms} />
  );
}
