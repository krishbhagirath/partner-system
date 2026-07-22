import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { BrandMark } from "@/components/site-header";
import { SignUpForm } from "./sign-up-form";

export const metadata = {
  title: "Create account | PartnerUp",
};

export default async function SignUpPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
        <div className="mb-8">
          <BrandMark withTagline />
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-lg shadow-zinc-950/5 sm:p-8">
          <div>
            <h1 className="font-display text-2xl font-bold text-zinc-950">Create your account</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Only McMaster students can join. Classmates will see your display name.
            </p>
          </div>

          <SignUpForm />

          <p className="mt-6 border-t border-zinc-200 pt-4 text-sm leading-6 text-zinc-600">
            Already have an account?{" "}
            <Link className="font-bold text-brand hover:underline" href="/auth/signin">
              Log in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
