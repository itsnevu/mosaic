import type { Metadata } from "next";
import Link from "next/link";
import { ContentFooter, ContentHeader, Eyebrow } from "@/components/ContentShell";
import { getDocs } from "@/lib/content";

export const metadata: Metadata = {
  title: "Docs — Mosaic Capital",
  description:
    "How the Mosaic vault works: the idle buffer, on-chain allocation scoring, the rebalance gates, fees, contracts and parameters.",
};

export default function DocsIndex() {
  const docs = getDocs();
  return (
    <>
      <ContentHeader active="/docs" />
      <main className="mx-auto max-w-[1200px] px-4 py-16 md:px-8 md:py-24">
        <Eyebrow>[Docs]</Eyebrow>
        <h1 className="mt-4 max-w-2xl text-4xl leading-[1.05] tracking-tighter text-zinc-900 md:text-5xl">
          One deposit, spread across many lending venues.
        </h1>
        <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-zinc-600">
          Everything below describes the vault as it is implemented — the parameters, the limits and
          the guarantees are what the contract enforces, not what the operator intends. For the full
          technical treatment, read the <Link href="/whitepaper" className="text-accent underline underline-offset-4 hover:text-zinc-900">whitepaper</Link>.
        </p>

        <ul className="mt-14 grid gap-4 sm:grid-cols-2">
          {docs.map((d, i) => (
            <li
              key={d.slug}
              // An odd count would leave a hole in the last row; the final card takes the width.
              className={i === docs.length - 1 && docs.length % 2 === 1 ? "sm:col-span-2" : ""}
            >
              <Link
                href={`/docs/${d.slug}`}
                className="surface surface-raise group flex h-full flex-col p-6 md:p-7"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="mt-3 text-[19px] tracking-tight text-zinc-900 group-hover:text-accent">{d.title}</h2>
                {d.summary && <p className="mt-2 text-[14.5px] leading-relaxed text-zinc-600">{d.summary}</p>}
                <span
                  aria-hidden
                  className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-300 transition-colors group-hover:text-accent"
                >
                  Read →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <ContentFooter />
    </>
  );
}
