"use client";

import { signOut } from "next-auth/react";

type SignOutButtonProps = {
  className?: string;
};

export function SignOutButton({ className }: SignOutButtonProps) {
  return (
    <button
      className={className}
      onClick={() => {
        void signOut({
          callbackUrl: "/auth/signin",
        });
      }}
      type="button"
    >
      Sign out
    </button>
  );
}
