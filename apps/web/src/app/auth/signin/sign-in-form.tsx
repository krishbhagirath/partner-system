"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

type SignInFormProps = {
  callbackUrl: string;
};

export function SignInForm({ callbackUrl }: SignInFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password.");
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
          className="h-12 rounded border border-zinc-300 bg-white px-3 text-base font-normal text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-[#7A003C] focus:ring-2 focus:ring-[#7A003C]/20"
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="test@mcmaster.ca"
          spellCheck={false}
          type="email"
          value={email}
        />
      </label>

      <label className="grid gap-2 text-sm font-semibold text-zinc-800" htmlFor="password">
        Password
        <input
          autoComplete="current-password"
          className="h-12 rounded border border-zinc-300 bg-white px-3 text-base font-normal text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-[#7A003C] focus:ring-2 focus:ring-[#7A003C]/20"
          id="password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          type="password"
          value={password}
        />
      </label>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {error}
        </p>
      ) : null}

      <button
        className="h-12 w-full rounded bg-[#7A003C] px-5 text-sm font-bold text-white transition hover:bg-[#5f0030] disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
        disabled={isSubmitting || email.trim().length === 0 || password.length === 0}
        type="submit"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
