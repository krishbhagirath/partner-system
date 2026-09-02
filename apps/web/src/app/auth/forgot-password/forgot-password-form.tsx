"use client";

import { FormEvent, useState } from "react";

import { alertError, button, input as inputClass } from "@/lib/ui";

type Status = "idle" | "sending" | "sent" | "error";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setError(null);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        body: JSON.stringify({ email: email.trim() }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }

      setStatus("sent");
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-800">
        If an account exists for that email, a reset link is on its way. Check your inbox — and your
        junk / quarantine folder, since McMaster can filter mail from newer senders. The link expires
        in 1 hour.
      </div>
    );
  }

  return (
    <form className="mt-6 grid gap-5" onSubmit={handleSubmit}>
      <label className="grid gap-2 text-sm font-semibold text-zinc-800" htmlFor="email">
        McMaster email
        <input
          autoCapitalize="none"
          autoComplete="email"
          className={inputClass}
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@mcmaster.ca"
          spellCheck={false}
          type="email"
          value={email}
        />
      </label>

      {error ? (
        <p className={alertError} role="alert">
          {error}
        </p>
      ) : null}

      <button
        className={`${button.primary} h-12 w-full`}
        disabled={status === "sending" || email.trim().length === 0}
        type="submit"
      >
        {status === "sending" ? "Sending..." : "Send reset link"}
      </button>
    </form>
  );
}
