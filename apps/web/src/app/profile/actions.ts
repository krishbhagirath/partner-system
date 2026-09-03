"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logServerError } from "@/server/api-error";
import { requireUser } from "@/server/auth";
import { updateUserProfile } from "@/server/lab-partner";

const updateProfileSchema = z.object({
  bio: z.string().trim().max(500).optional(),
  contactInstagram: z.string().trim().max(50).optional(),
  contactOther: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  displayName: z.string().trim().min(2).max(80),
  program: z.string().trim().max(100).optional(),
  year: z.string().trim().max(40).optional(),
});

export async function updateProfileDetails(formData: FormData) {
  const parsedForm = updateProfileSchema.safeParse({
    bio: formData.get("bio"),
    contactInstagram: formData.get("contactInstagram"),
    contactOther: formData.get("contactOther"),
    contactPhone: formData.get("contactPhone"),
    displayName: formData.get("displayName"),
    program: formData.get("program"),
    year: formData.get("year"),
  });

  if (!parsedForm.success) {
    throw new Error("Unable to save profile. Check your inputs and try again.");
  }

  // At least one contact method is required so matched partners can reach the user.
  const hasContact = [
    parsedForm.data.contactPhone,
    parsedForm.data.contactInstagram,
    parsedForm.data.contactOther,
  ].some((value) => value?.trim());

  if (!hasContact) {
    redirect("/profile?notice=need-contact");
  }

  const user = await requireUser();

  try {
    await updateUserProfile(user.id, {
      bio: parsedForm.data.bio?.trim() || null,
      contactInstagram: parsedForm.data.contactInstagram?.trim() || null,
      contactOther: parsedForm.data.contactOther?.trim() || null,
      contactPhone: parsedForm.data.contactPhone?.trim() || null,
      displayName: parsedForm.data.displayName,
      program: parsedForm.data.program?.trim() || null,
      year: parsedForm.data.year?.trim() || null,
    });
  } catch (error) {
    logServerError("updateProfileDetails action", error, { userId: user.id });

    throw error;
  }

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  redirect("/profile?notice=profile-saved");
}
