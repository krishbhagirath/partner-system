"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signOut } from "@/auth";
import { logServerError } from "@/server/api-error";
import { requireUser } from "@/server/auth";
import {
  deleteUser,
  dissolveMatch,
  PartnerRequestError,
  toggleDiscoverableSection,
  updateNotificationPreferences,
} from "@/server/lab-partner";

const discoverabilityFormSchema = z.object({
  isActive: z.boolean(),
  note: z.string().trim().max(180).optional(),
  partnerNeedResponse: z.enum(["YES", "NO", "UNSURE"]).optional(),
  sectionId: z.string().min(1),
});

const requestIdFormSchema = z.object({
  requestId: z.string().min(1),
});

const notificationPreferencesFormSchema = z.object({
  notifyOnMatch: z.boolean(),
  notifyOnRequest: z.boolean(),
});

export async function updateSectionDiscoverability(formData: FormData) {
  const parsedForm = discoverabilityFormSchema.safeParse({
    isActive: formData.get("isActive") === "on",
    note: formData.get("note"),
    // Radio group with no pre-selected default — omitted entirely from the
    // vote if the student doesn't touch it, so we never record a silent,
    // undeliberate answer just because they saved an unrelated field.
    partnerNeedResponse: formData.get("partnerNeedResponse") || undefined,
    sectionId: formData.get("sectionId"),
  });

  if (!parsedForm.success) {
    throw new Error("Unable to save discoverability settings.");
  }

  const user = await requireUser();
  const note = parsedForm.data.note?.trim() || null;

  try {
    await toggleDiscoverableSection(
      user.id,
      parsedForm.data.sectionId,
      parsedForm.data.isActive,
      note,
      parsedForm.data.partnerNeedResponse,
    );
  } catch (error) {
    logServerError("updateSectionDiscoverability action", error, { userId: user.id });

    throw error;
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/sections");
  redirect("/settings?notice=discoverability-saved");
}

export async function unmatchPartner(formData: FormData) {
  const parsedForm = requestIdFormSchema.safeParse({
    requestId: formData.get("requestId"),
  });

  if (!parsedForm.success) {
    throw new Error("Unable to remove the match.");
  }

  const user = await requireUser();
  let notice = "unmatched";

  try {
    await dissolveMatch(user.id, parsedForm.data.requestId);
  } catch (error) {
    if (!(error instanceof PartnerRequestError)) {
      logServerError("unmatchPartner action", error, { userId: user.id });

      throw error;
    }

    notice = "request-conflict";
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/matches");
  revalidatePath("/sections");
  redirect(`/settings?notice=${notice}`);
}

export async function updateNotificationPreferencesAction(formData: FormData) {
  const parsedForm = notificationPreferencesFormSchema.safeParse({
    notifyOnMatch: formData.get("notifyOnMatch") === "on",
    notifyOnRequest: formData.get("notifyOnRequest") === "on",
  });

  if (!parsedForm.success) {
    throw new Error("Unable to save notification preferences.");
  }

  const user = await requireUser();

  try {
    await updateNotificationPreferences(user.id, parsedForm.data);
  } catch (error) {
    logServerError("updateNotificationPreferences action", error, { userId: user.id });

    throw error;
  }

  revalidatePath("/settings");
  redirect("/settings?notice=notifications-saved");
}

export async function deleteOwnAccount() {
  const user = await requireUser();

  try {
    await deleteUser(user.id);
  } catch (error) {
    logServerError("deleteOwnAccount action", error, { userId: user.id });

    throw error;
  }

  await signOut({ redirectTo: "/?notice=account-deleted" });
}
