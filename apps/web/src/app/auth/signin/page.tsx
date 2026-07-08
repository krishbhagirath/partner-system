import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SignInForm } from "./sign-in-form";

type SignInPageProps = {
  searchParams?: Promise<{
    callbackUrl?: string;
  }>;
};

export const metadata = {
  title: "Sign in | LabPartner",
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
        <Link className="mb-8 flex items-center gap-3" href="/">
          <span className="grid size-10 place-items-center rounded bg-[#7A003C] text-sm font-bold text-white">
            LP
          </span>
          <span>
            <span className="block text-sm font-semibold uppercase text-[#7A003C]">McMaster</span>
            <span className="block text-lg font-bold leading-none">LabPartner</span>
          </span>
        </Link>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-black text-zinc-950">Sign in</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Use the local test account created by `npm run seed`.
            </p>
          </div>

          <SignInForm callbackUrl={callbackUrl} />
        </div>
      </section>
    </main>
  );
}

function safeCallbackUrl(callbackUrl: string | undefined) {
  if (!callbackUrl?.startsWith("/") || callbackUrl.startsWith("//")) {
    return "/import";
  }

  return callbackUrl;
}
