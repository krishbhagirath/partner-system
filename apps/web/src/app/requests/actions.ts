"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logServerError } from "@/server/api-error";
import { requireUser } from "@/server/auth";
import {
  PartnerRequestError,
  respondToPartnerRequest,
  withdrawPartnerRequest,
} from "@/server/lab-partner";

const respondToPartnerRequestFormSchema = z.object({
  requestId: z.string().min(1),
  status: z.enum(["ACCEPTED", "DECLINED"]),
});

const requestIdFormSchema = z.object({
  requestId: z.string().min(1),
});

export async function updatePartnerRequestStatus(formData: FormData) {
  const parsedForm = respondToPartnerRequestFormSchema.safeParse({
    requestId: formData.get("requestId"),
    status: formData.get("status"),
  });

  if (!parsedForm.success) {
    throw new Error("Unable to update partner request.");
  }

  const user = await requireUser();
  let notice = parsedForm.data.status === "ACCEPTED" ? "request-accepted" : "request-declined";

  try {
    await respondToPartnerRequest(user.id, parsedForm.data.requestId, parsedForm.data.status);
  } catch (error) {
    // Expected conflicts (request already resolved, section already matched)
    // resolve by refreshing the page so it shows the current state instead of
    // crashing to the error boundary.
    if (!(error instanceof PartnerRequestError)) {
      logServerError("updatePartnerRequestStatus action", error, { userId: user.id });

      throw error;
    }

    notice = "request-conflict";
  }

  revalidatePath("/requests");
  revalidatePath("/dashboard");
  revalidatePath("/matches");
  revalidatePath("/sections");
  redirect(`/requests?notice=${notice}&tab=received`);
}

export async function withdrawSentRequest(formData: FormData) {
  const parsedForm = requestIdFormSchema.safeParse({
    requestId: formData.get("requestId"),
  });

  if (!parsedForm.success) {
    throw new Error("Unable to withdraw partner request.");
  }

  const user = await requireUser();
  let notice = "request-withdrawn";

  try {
    await withdrawPartnerRequest(user.id, parsedForm.data.requestId);
  } catch (error) {
    if (!(error instanceof PartnerRequestError)) {
      logServerError("withdrawSentRequest action", error, { userId: user.id });

      throw error;
    }

    notice = "request-conflict";
  }

  revalidatePath("/requests");
  revalidatePath("/sections");
  redirect(`/requests?notice=${notice}&tab=sent`);
}
