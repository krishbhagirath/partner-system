import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { BrandMark } from "@/components/site-header";
import { SignInForm } from "./sign-in-form";

type SignInPageProps = {
  searchParams?: Promise<{
    callbackUrl?: string;
    error?: string;
    reset?: string;
    verified?: string;
  }>;
};

export const metadata = {
  title: "Sign in | PartnerUp",
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  const resolvedSearchParams = await searchParams;
  const callbackUrl = safeCallbackUrl(resolvedSearchParams?.callbackUrl);

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
        <div className="mb-8">
          <BrandMark withTagline />
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-lg shadow-zinc-950/5 sm:p-8">
          <div>
            <h1 className="font-display text-2xl font-bold text-zinc-950">Welcome back</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Log in with your McMaster email.
            </p>
          </div>

          {resolvedSearchParams?.verified ? (
            <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              Email verified. You can now sign in.
            </p>
          ) : null}

          {resolvedSearchParams?.reset ? (
            <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              Password reset. Sign in with your new password.
            </p>
          ) : null}

          <SignInForm callbackUrl={callbackUrl} />

          <p className="mt-6 border-t border-zinc-200 pt-4 text-sm leading-6 text-zinc-600">
            New here?{" "}
            <Link className="font-bold text-brand hover:underline" href="/auth/signup">
              Create an account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

function safeCallbackUrl(callbackUrl: string | undefined) {
  if (!callbackUrl?.startsWith("/") || callbackUrl.startsWith("//")) {
    return "/dashboard";
  }

  return callbackUrl;
}
