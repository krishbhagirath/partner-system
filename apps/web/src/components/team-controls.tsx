import { updateTeamCompletionAction } from "@/app/settings/actions";
import { PendingButton } from "@/components/pending-button";
import { TEAMS_ENABLED } from "@/lib/feature-flags";
import { button } from "@/lib/ui";

/**
 * The open/complete switch for a team. Any member may flip it either way.
 *
 * Hidden entirely when teams are disabled, which is what keeps a two-person team
 * looking exactly like the old "confirmed partner" state.
 */
export function TeamCompletionControls({
  isComplete,
  redirectTo,
  teamId,
}: {
  isComplete: boolean;
  redirectTo: string;
  teamId: string;
}) {
  if (!TEAMS_ENABLED) {
    return null;
  }

  return (
    <form action={updateTeamCompletionAction} className="mt-3">
      <input name="teamId" type="hidden" value={teamId} />
      <input name="isComplete" type="hidden" value={isComplete ? "false" : "true"} />
      <input name="redirectTo" type="hidden" value={redirectTo} />
      <PendingButton
        className={`${button.secondary} w-full justify-center text-xs`}
        pendingLabel="Saving..."
      >
        {isComplete ? "Need more people?" : "Mark team complete"}
      </PendingButton>
    </form>
  );
}

/**
 * Shown right after a request is accepted, on whichever page the user lands on.
 *
 * This is the piece that makes complete-by-default work: a new team is closed, and
 * this catches the minority who need a third or fourth person at the one moment they
 * are certain to be looking at the screen. Without it they would have to go hunting
 * through Settings, and larger teams would never form.
 */
export function TeamCompletePrompt({
  isComplete,
  redirectTo,
  teamId,
}: {
  isComplete: boolean;
  redirectTo: string;
  teamId: string;
}) {
  if (!TEAMS_ENABLED || !isComplete) {
    return null;
  }

  return (
    <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/25 bg-brand-tint px-4 py-3">
      <div>
        <p className="text-sm font-bold text-brand">Team complete</p>
        <p className="mt-0.5 text-sm text-zinc-600">
          Working in a bigger group? Open your team so classmates can ask to join.
        </p>
      </div>
      <form action={updateTeamCompletionAction}>
        <input name="teamId" type="hidden" value={teamId} />
        <input name="isComplete" type="hidden" value="false" />
        <input name="redirectTo" type="hidden" value={redirectTo} />
        <PendingButton className={button.primary} pendingLabel="Opening...">
          We need more people
        </PendingButton>
      </form>
    </section>
  );
}

/** Contact details for one teammate. Only ever rendered for a confirmed teammate. */
export function TeammateContact({
  teammate,
}: {
  teammate: {
    contactInstagram: string | null;
    contactOther: string | null;
    contactPhone: string | null;
    email: string;
  };
}) {
  return (
    <div className="grid gap-1 text-sm text-zinc-500">
      <p>✉ {teammate.email}</p>
      {teammate.contactPhone ? <p>📞 {teammate.contactPhone}</p> : null}
      {teammate.contactInstagram ? <p>📷 {teammate.contactInstagram}</p> : null}
      {teammate.contactOther ? <p>💬 {teammate.contactOther}</p> : null}
    </div>
  );
}
