import Link from "next/link";

import { BrandMark } from "@/components/site-header";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = {
  title: "Reset password | PartnerUp",
};

type ResetPasswordPageProps = {
  searchParams?: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const token = (await searchParams)?.token ?? "";

  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
        <div className="mb-8">
          <BrandMark withTagline />
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-lg shadow-zinc-950/5 sm:p-8">
          <h1 className="font-display text-2xl font-bold text-zinc-950">Set a new password</h1>

          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              This reset link is missing its token. Request a new one from{" "}
              <Link className="font-bold underline" href="/auth/forgot-password">
                Forgot password
              </Link>
              .
            </p>
          )}

          <p className="mt-6 border-t border-zinc-200 pt-4 text-sm leading-6 text-zinc-600">
            Back to{" "}
            <Link className="font-bold text-brand hover:underline" href="/auth/signin">
              sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
