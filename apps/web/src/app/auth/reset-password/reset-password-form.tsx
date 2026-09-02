"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { alertError, button, input as inputClass } from "@/lib/ui";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordsMatch = password === confirmPassword;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        body: JSON.stringify({ password, token }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "Couldn't reset your password. Please try again.");
        return;
      }

      router.push("/auth/signin?reset=1");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-6 grid gap-5" onSubmit={handleSubmit}>
      <label className="grid gap-2 text-sm font-semibold text-zinc-800" htmlFor="password">
        New password
        <div className="relative">
          <input
            autoComplete="new-password"
            className={`${inputClass} pr-16`}
            id="password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 10 characters"
            type={showPassword ? "text" : "password"}
            value={password}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-500 hover:text-zinc-800"
            onClick={() => setShowPassword((value) => !value)}
            type="button"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      <label className="grid gap-2 text-sm font-semibold text-zinc-800" htmlFor="confirm-password">
        Re-enter password
        <input
          autoComplete="new-password"
          className={inputClass}
          id="confirm-password"
          name="confirm-password"
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Re-enter your password"
          type={showPassword ? "text" : "password"}
          value={confirmPassword}
        />
        {confirmPassword.length > 0 && !passwordsMatch ? (
          <span className="text-xs font-medium text-red-600">Passwords do not match.</span>
        ) : null}
      </label>

      {error ? (
        <p className={alertError} role="alert">
          {error}
        </p>
      ) : null}

      <button
        className={`${button.primary} h-12 w-full`}
        disabled={isSubmitting || password.length < 10 || !passwordsMatch}
        type="submit"
      >
        {isSubmitting ? "Resetting..." : "Reset password"}
      </button>
    </form>
  );
}
