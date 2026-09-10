import type { Metadata } from "next";
import Link from "next/link";
import { ContentFooter, ContentHeader, Eyebrow, TableOfContents } from "@/components/ContentShell";
import { formatDate, getWhitepaper } from "@/lib/content";

export const metadata: Metadata = {
  title: "Whitepaper — Mosaic Capital",
  description:
    "The Mosaic protocol as implemented: vault accounting, the adapter interface, on-chain allocation scoring, rebalance economics, liquidity guarantees, fees and failure modes.",
};

export default function WhitepaperPage() {
  const doc = getWhitepaper();
  return (
    <>
      <ContentHeader active="/whitepaper" />
      <div className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-12 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-[minmax(0,1fr)_220px]">
        <article className="mx-auto w-full min-w-0 max-w-[72ch]">
          <Eyebrow>[Whitepaper]</Eyebrow>
          <h1 className="mt-4 text-[38px] leading-[1.06] tracking-tighter text-zinc-900 md:text-[44px]">
            {doc.title}
          </h1>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
            {formatDate(doc.date)} · {doc.readingTime}
          </p>
          <p className="mt-6 border-l-2 border-accent pl-4 text-[17px] leading-relaxed text-zinc-600">
            {doc.summary}
          </p>
          <div className="prose-mosaic mt-12" dangerouslySetInnerHTML={{ __html: doc.html }} />

          <p className="mt-16 border-t border-black/8 pt-8 text-[15px] leading-relaxed text-zinc-600">
            For the practical version, see the{" "}
            <Link href="/docs" className="text-accent underline underline-offset-4 hover:text-zinc-900">docs</Link>. For
            the trust model, invariants and known gaps, see{" "}
            <Link href="/docs/security" className="text-accent underline underline-offset-4 hover:text-zinc-900">
              security
            </Link>
            .
          </p>
        </article>

        <TableOfContents headings={doc.headings} />
      </div>
      <ContentFooter />
    </>
  );
}
