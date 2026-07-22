"use client";

import { useFormStatus } from "react-dom";

type PendingButtonProps = {
  children: React.ReactNode;
  className?: string;
  pendingLabel: string;
};

// Submit button for server-action forms: disables itself and shows progress
// while the action runs, which also prevents double submissions.
export function PendingButton({ children, className, pendingLabel }: PendingButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
