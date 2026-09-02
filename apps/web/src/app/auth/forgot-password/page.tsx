import Link from "next/link";

import { BrandMark } from "@/components/site-header";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = {
  title: "Forgot password | PartnerUp",
};

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
        <div className="mb-8">
          <BrandMark withTagline />
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-lg shadow-zinc-950/5 sm:p-8">
          <h1 className="font-display text-2xl font-bold text-zinc-950">Forgot your password?</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Enter your McMaster email and we&apos;ll send you a link to set a new password.
          </p>

          <ForgotPasswordForm />

          <p className="mt-6 border-t border-zinc-200 pt-4 text-sm leading-6 text-zinc-600">
            Remembered it?{" "}
            <Link className="font-bold text-brand hover:underline" href="/auth/signin">
              Back to sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
