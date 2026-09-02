"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

import { alertError, button, input as inputClass } from "@/lib/ui";

type SignInFormProps = {
  callbackUrl: string;
};

export function SignInForm({ callbackUrl }: SignInFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    <form className="mt-6 grid gap-5" onSubmit={handleSubmit}>
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

      <div className="-mt-2 flex justify-end">
        <Link
          className="text-xs font-semibold text-zinc-500 hover:text-brand"
          href="/auth/forgot-password"
        >
          Forgot password?
        </Link>
      </div>

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
  );
}
