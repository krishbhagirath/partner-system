"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

import { alertError, button, input as inputClass } from "@/lib/ui";

type SignInFormProps = {
  callbackUrl: string;
  oauthError?: string;
};

const oauthErrorMessages: Record<string, string> = {
  AccessDenied: "Sign in with your @mcmaster.ca Microsoft account to continue.",
  OAuthAccountNotLinked:
    "That email is already registered with a password. Sign in with your password instead.",
};

export function SignInForm({ callbackUrl, oauthError }: SignInFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    oauthError ? (oauthErrorMessages[oauthError] ?? "Unable to sign in with Microsoft.") : null,
  );
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMicrosoftSubmitting, setIsMicrosoftSubmitting] = useState(false);

  async function handleMicrosoftSignIn() {
    setIsMicrosoftSubmitting(true);
    setError(null);
    await signIn("microsoft-entra-id", { callbackUrl });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setError(null);
    setNeedsVerification(false);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        if (result.code === "EmailNotVerified") {
          setNeedsVerification(true);
          setError("Verify your email before signing in.");
        } else {
          setError("Invalid email or password.");
        }
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-6 grid gap-5">
      <button
        className={`${button.secondary} h-12 w-full gap-3`}
        disabled={isMicrosoftSubmitting}
        onClick={handleMicrosoftSignIn}
        type="button"
      >
        <MicrosoftLogo />
        {isMicrosoftSubmitting ? "Redirecting to Microsoft..." : "Continue with Microsoft"}
      </button>

      <div className="flex items-center gap-3 text-xs font-semibold uppercase text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200" />
        or
        <span className="h-px flex-1 bg-zinc-200" />
      </div>

      <form className="grid gap-5" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm font-semibold text-zinc-800" htmlFor="email">
          Email
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

        <label className="grid gap-2 text-sm font-semibold text-zinc-800" htmlFor="password">
          Password
          <input
            autoComplete="current-password"
            className={inputClass}
            id="password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            type="password"
            value={password}
          />
        </label>

        {error ? (
          <p className={alertError} role="alert">
            {error}{" "}
            {needsVerification ? (
              <Link
                className="font-bold underline"
                href={`/auth/verify-email?email=${encodeURIComponent(email)}`}
              >
                Resend the verification email
              </Link>
            ) : null}
          </p>
        ) : null}

        <button
          className={`${button.primary} h-12 w-full`}
          disabled={isSubmitting || email.trim().length === 0 || password.length === 0}
          type="submit"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function MicrosoftLogo() {
  return (
    <svg aria-hidden height="18" viewBox="0 0 21 21" width="18">
      <rect fill="#f25022" height="10" width="10" x="1" y="1" />
      <rect fill="#00a4ef" height="10" width="10" x="1" y="11" />
      <rect fill="#7fba00" height="10" width="10" x="11" y="1" />
      <rect fill="#ffb900" height="10" width="10" x="11" y="11" />
    </svg>
  );
}
