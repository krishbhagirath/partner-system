"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

import { alertError, button, input as inputClassName } from "@/lib/ui";

export function SignUpForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit =
    displayName.trim().length >= 2 &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    !isSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/register", {
        body: JSON.stringify({
          displayName: displayName.trim(),
          email: email.trim(),
          password,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          issues?: string[];
        } | null;

        setError(payload?.issues?.join(" ") || payload?.error || "Unable to create the account.");
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        verificationRequired?: boolean;
      } | null;

      // When verification is enabled, send them to the check-your-email screen.
      if (payload?.verificationRequired) {
        router.push(`/auth/verify-email?email=${encodeURIComponent(email.trim())}`);
        return;
      }

      // Verification is off: sign the new account in directly so they land in the
      // app without re-typing. Fall back to the sign-in page if that fails.
      const signInResult = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (signInResult?.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        router.push("/auth/signin");
      }
    } catch {
      setError("Unable to create the account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-6 grid gap-5" onSubmit={handleSubmit}>
      <label className="grid gap-2 text-sm font-semibold text-zinc-800" htmlFor="display-name">
        Display name
        <input
          autoComplete="name"
          className={inputClassName}
          id="display-name"
          maxLength={80}
          name="display-name"
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Your name"
          type="text"
          value={displayName}
        />
      </label>

      <label className="grid gap-2 text-sm font-semibold text-zinc-800" htmlFor="email">
        McMaster email
        <input
          autoCapitalize="none"
          autoComplete="email"
          className={inputClassName}
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@mcmaster.ca"
          spellCheck={false}
          type="email"
          value={email}
        />
      </label>

      <label className="grid gap-2 text-sm font-semibold text-zinc-800" htmlFor="password">
        Password
        <input
          autoComplete="new-password"
          className={inputClassName}
          id="password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 8 characters"
          type="password"
          value={password}
        />
      </label>

      {error ? (
        <p className={alertError} role="alert">
          {error}
        </p>
      ) : null}

      <button className={`${button.primary} h-12 w-full`} disabled={!canSubmit} type="submit">
        {isSubmitting ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
