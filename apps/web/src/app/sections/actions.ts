"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logServerError } from "@/server/api-error";
import { requireUser } from "@/server/auth";
import { createPartnerRequest, PartnerRequestError } from "@/server/lab-partner";

const sendPartnerRequestSchema = z.object({
  message: z.string().trim().max(180).optional(),
  receiverId: z.string().min(1),
  sectionId: z.string().min(1),
});

export async function sendPartnerRequest(formData: FormData) {
  const parsedForm = sendPartnerRequestSchema.safeParse({
    message: formData.get("message"),
    receiverId: formData.get("receiverId"),
    sectionId: formData.get("sectionId"),
  });

  if (!parsedForm.success) {
    throw new Error("Unable to send partner request.");
  }

  const user = await requireUser();
  const message = parsedForm.data.message?.trim() || null;

  let notice = "request-sent";

  try {
    await createPartnerRequest(
      user.id,
      parsedForm.data.receiverId,
      parsedForm.data.sectionId,
      message,
    );
  } catch (error) {
    // Expected conflicts (target no longer discoverable, someone just matched)
    // resolve by refreshing the page so it shows the current state instead of
    // crashing to the error boundary.
    if (!(error instanceof PartnerRequestError)) {
      logServerError("sendPartnerRequest action", error, { userId: user.id });

      throw error;
    }

    notice = "request-conflict";
  }

  revalidatePath("/sections");
  revalidatePath("/profile");
  redirect(`/sections?notice=${notice}`);
}
