"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signOut } from "@/auth";
import { logServerError } from "@/server/api-error";
import { requireUser } from "@/server/auth";
import {
  deleteUser,
  leaveTeam,
  PartnerRequestError,
  setTeamCompletion,
  toggleDiscoverableSection,
  updateNotificationPreferences,
} from "@/server/lab-partner";

const discoverabilityFormSchema = z.object({
  isActive: z.boolean(),
  note: z.string().trim().max(180).optional(),
  partnerNeedResponse: z.enum(["YES", "NO", "UNSURE"]).optional(),
  sectionId: z.string().min(1),
});

const teamIdFormSchema = z.object({
  teamId: z.string().min(1),
});

const teamCompletionFormSchema = z.object({
  isComplete: z.boolean(),
  teamId: z.string().min(1),
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

export async function leaveTeamAction(formData: FormData) {
  const parsedForm = teamIdFormSchema.safeParse({
    teamId: formData.get("teamId"),
  });

  if (!parsedForm.success) {
    throw new Error("Unable to leave the team.");
  }

  const user = await requireUser();
  let notice = "team-left";

  try {
    await leaveTeam(user.id, parsedForm.data.teamId);
  } catch (error) {
    if (!(error instanceof PartnerRequestError)) {
      logServerError("leaveTeamAction", error, { userId: user.id });

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

/** Opens a team to new members, or closes it. Any member may do either. */
export async function updateTeamCompletionAction(formData: FormData) {
  const parsedForm = teamCompletionFormSchema.safeParse({
    isComplete: formData.get("isComplete") === "true",
    teamId: formData.get("teamId"),
  });

  if (!parsedForm.success) {
    throw new Error("Unable to update the team.");
  }

  const user = await requireUser();
  const redirectTo = formData.get("redirectTo");
  const target = typeof redirectTo === "string" && redirectTo.startsWith("/") ? redirectTo : "/settings";
  let notice = parsedForm.data.isComplete ? "team-completed" : "team-opened";

  try {
    await setTeamCompletion(user.id, parsedForm.data.teamId, parsedForm.data.isComplete);
  } catch (error) {
    if (!(error instanceof PartnerRequestError)) {
      logServerError("updateTeamCompletionAction", error, { userId: user.id });

      throw error;
    }

    notice = "request-conflict";
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/matches");
  revalidatePath("/sections");
  revalidatePath("/requests");
  redirect(`${target}?notice=${notice}`);
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
