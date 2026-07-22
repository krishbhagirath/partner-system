"use client";

import { FormEvent, useState } from "react";

import { button, input as inputClass } from "@/lib/ui";

export function ResendVerificationButton({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }

    setStatus("sending");
    setError(null);

    try {
      const response = await fetch("/api/auth/verify-email/resend", {
        body: JSON.stringify({ email: email.trim() }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok && response.status !== 429) {
        throw new Error("Unable to resend the verification email.");
      }

      setStatus("sent");
    } catch {
      setStatus("idle");
      setError("Unable to resend the verification email. Try again in a moment.");
    }
  }

  if (status === "sent") {
    return (
      <p className="mt-4 text-sm font-semibold text-emerald-700">
        Verification email sent. Check your inbox.
      </p>
    );
  }

  return (
    <form className="mt-4 flex flex-col items-center gap-3" onSubmit={handleSubmit}>
      {!initialEmail ? (
        <input
          autoCapitalize="none"
          className={`${inputClass} max-w-xs`}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@mcmaster.ca"
          spellCheck={false}
          type="email"
          value={email}
        />
      ) : null}
      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
      <button className={button.secondary} disabled={status === "sending"} type="submit">
        {status === "sending" ? "Sending..." : "Resend email"}
      </button>
    </form>
  );
}
