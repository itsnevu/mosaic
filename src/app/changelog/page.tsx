import type { Metadata } from "next";
import Link from "next/link";
import { ContentFooter, ContentHeader, Eyebrow, TableOfContents } from "@/components/ContentShell";
import { formatDate, getChangelog } from "@/lib/content";

export const metadata: Metadata = {
  title: "Changelog — Mosaic Capital",
  description:
    "What changed in Mosaic, when, and where to check it. Every entry names the code or the contract call that makes it true.",
};

export default function ChangelogPage() {
  const doc = getChangelog();
  return (
    <>
      <ContentHeader active="/changelog" />
      <div className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-12 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-[minmax(0,1fr)_220px]">
        <article className="mx-auto w-full min-w-0 max-w-[72ch]">
          <Eyebrow>[Changelog]</Eyebrow>
          <h1 className="mt-4 text-[38px] leading-[1.06] tracking-tighter text-zinc-900 md:text-[44px]">
            {doc.title}
          </h1>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
            Last entry {formatDate(doc.date)}
          </p>
          <p className="mt-6 border-l-2 border-accent pl-4 text-[17px] leading-relaxed text-zinc-600">
            {doc.summary}
          </p>
          <div className="prose-mosaic mt-12" dangerouslySetInnerHTML={{ __html: doc.html }} />

          <p className="mt-16 border-t border-black/8 pt-8 text-[15px] leading-relaxed text-zinc-600">
            The source is public at{" "}
            <a
              href="https://github.com/itsnevu/mosaic"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline underline-offset-4 hover:text-zinc-900"
            >
              github.com/itsnevu/mosaic
            </a>
            ; every entry above corresponds to commits there. For what the vault does, see the{" "}
            <Link href="/docs" className="text-accent underline underline-offset-4 hover:text-zinc-900">docs</Link>.
          </p>
        </article>

        <TableOfContents headings={doc.headings} />
      </div>
      <ContentFooter />
    </>
  );
}
