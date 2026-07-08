import { notFound } from "next/navigation";

import { ImportParserDebug } from "./import-parser-debug";

export const dynamic = "force-dynamic";

export default function ImportParserDebugPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 sm:px-8 lg:px-10">
        <div className="border-4 border-[#7A003C] bg-[#FDBF57] px-5 py-4 text-zinc-950">
          <p className="text-sm font-black uppercase tracking-wide">Development only</p>
          <h1 className="mt-1 text-3xl font-black">Import Parser Debug</h1>
        </div>

        <ImportParserDebug />
      </section>
    </main>
  );
}
