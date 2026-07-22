import Link from "next/link";

import { BrandMark } from "@/components/site-header";

import { ResendVerificationButton } from "./resend-verification-button";

export const metadata = {
  title: "Verify your email | PartnerUp",
};

type VerifyEmailPageProps = {
  searchParams?: Promise<{
    email?: string;
    error?: string;
  }>;
};

const errorCopy: Record<string, string> = {
  "expired-token": "That verification link expired. Request a new one below.",
  "invalid-token": "That verification link is invalid or has already been used.",
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const resolvedSearchParams = await searchParams;
  const email = resolvedSearchParams?.email ?? "";
  const errorMessage = resolvedSearchParams?.error
    ? (errorCopy[resolvedSearchParams.error] ?? "Something went wrong verifying your email.")
    : null;

  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-10 text-center">
        <div className="mb-8">
          <BrandMark withTagline />
        </div>

        <div className="grid size-16 place-items-center rounded-full bg-brand/10 text-3xl text-brand">
          ✉
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-zinc-950">Check your inbox</h1>
        <p className="mx-auto mt-3 max-w-sm text-[15px] leading-6 text-zinc-600">
          {email ? (
            <>
              We sent a verification link to <span className="font-semibold">{email}</span>.
              Click it to activate your account.
            </>
          ) : (
            "We sent a verification link to your @mcmaster.ca email. Click it to activate your account."
          )}
        </p>

        {errorMessage ? (
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
            {errorMessage}
          </p>
        ) : null}

        <ResendVerificationButton initialEmail={email} />

        <p className="mt-6 text-sm text-zinc-500">
          Already verified?{" "}
          <Link className="font-bold text-brand hover:underline" href="/auth/signin">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
