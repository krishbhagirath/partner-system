import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import { PendingButton } from "@/components/pending-button";
import { getInitials } from "@/lib/format";
import {
  button,
  input as inputClass,
  pageLede,
  pageTitle,
  textarea as textareaClass,
} from "@/lib/ui";
import { requirePageUser } from "@/server/auth";
import { getUserProfile } from "@/server/lab-partner";

import { updateProfileDetails } from "./actions";

export const metadata: Metadata = {
  title: "Profile | PartnerUp",
};

type ProfilePageProps = {
  searchParams?: Promise<{
    notice?: string;
  }>;
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const user = await requirePageUser();
  const notice = (await searchParams)?.notice;
  const profile = await getUserProfile(user.id);

  const displayName = profile?.displayName ?? profile?.name ?? user.email;

  return (
    <AppShell active="profile" pageTitle="Your profile" user={user}>
      <h1 className={pageTitle}>Your profile</h1>
      <p className={pageLede}>
        This is what classmates see. Contact details stay hidden until you match.
      </p>

      <NoticeBanner clearHref="/profile" notice={notice} />

      <div className="mt-6 max-w-xl rounded-lg border border-rule bg-surface p-7">
        <div className="mb-6 flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-full bg-brand font-display text-xl font-bold text-white">
            {getInitials(displayName)}
          </span>
          <div>
            <p className="text-lg font-bold text-ink">{displayName}</p>
            <p className="text-sm text-muted">{user.email}</p>
          </div>
        </div>

        <form action={updateProfileDetails} className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-ink" htmlFor="displayName">
            Display name
            <input
              className={inputClass}
              defaultValue={displayName}
              id="displayName"
              maxLength={80}
              minLength={2}
              name="displayName"
              required
              type="text"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-ink" htmlFor="program">
            Program
            <input
              className={inputClass}
              defaultValue={profile?.program ?? ""}
              id="program"
              maxLength={100}
              name="program"
              placeholder="Computer Science"
              type="text"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-ink" htmlFor="year">
            Year
            <input
              className={inputClass}
              defaultValue={profile?.year ?? ""}
              id="year"
              maxLength={40}
              name="year"
              placeholder="Level II"
              type="text"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-ink" htmlFor="bio">
            About you
            <textarea
              className={`${textareaClass} min-h-24`}
              defaultValue={profile?.bio ?? ""}
              id="bio"
              maxLength={500}
              name="bio"
              placeholder="Looking for someone reliable to split lab reports with."
              rows={3}
            />
          </label>

          <div className="mt-2 border-t border-rule pt-4">
            <p className="text-sm font-bold text-ink">
              Contact info <span className="font-semibold text-brand">(at least one required)</span>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              So matched partners can reach you. Only shown to classmates you&apos;ve confirmed as a
              partner, never in Find partners or Requests.
            </p>

            <div className="mt-3 grid gap-4">
              <label
                className="grid gap-2 text-sm font-semibold text-ink"
                htmlFor="contactPhone"
              >
                Phone number
                <input
                  className={inputClass}
                  defaultValue={profile?.contactPhone ?? ""}
                  id="contactPhone"
                  maxLength={30}
                  name="contactPhone"
                  placeholder="905-555-0100"
                  type="tel"
                />
              </label>

              <label
                className="grid gap-2 text-sm font-semibold text-ink"
                htmlFor="contactInstagram"
              >
                Instagram
                <input
                  className={inputClass}
                  defaultValue={profile?.contactInstagram ?? ""}
                  id="contactInstagram"
                  maxLength={50}
                  name="contactInstagram"
                  placeholder="@yourhandle"
                  type="text"
                />
              </label>

              <label
                className="grid gap-2 text-sm font-semibold text-ink"
                htmlFor="contactOther"
              >
                Other (Discord, Snapchat, etc.)
                <input
                  className={inputClass}
                  defaultValue={profile?.contactOther ?? ""}
                  id="contactOther"
                  maxLength={200}
                  name="contactOther"
                  placeholder="Discord: yourname#0001"
                  type="text"
                />
              </label>
            </div>
          </div>

          <PendingButton className={`${button.primary} justify-self-start`} pendingLabel="Saving...">
            Save changes
          </PendingButton>
        </form>
      </div>
    </AppShell>
  );
}
