"use client";

import { useFormStatus } from "react-dom";

type ConfirmSubmitButtonProps = {
  children: React.ReactNode;
  className?: string;
  confirmMessage: string;
  pendingLabel: string;
};

// Submit button for server-action forms that asks for confirmation first and
// shows progress while the action runs.
export function ConfirmSubmitButton({
  children,
  className,
  confirmMessage,
  pendingLabel,
}: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
