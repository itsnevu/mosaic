import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentFooter, ContentHeader, Eyebrow, TableOfContents } from "@/components/ContentShell";
import { getDoc, getDocs } from "@/lib/content";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getDocs().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) return { title: "Docs — Mosaic Capital" };
  return { title: `${doc.title} — Mosaic Docs`, description: doc.summary };
}

export default async function DocPage({ params }: Params) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  const docs = getDocs();
  const index = docs.findIndex((d) => d.slug === slug);
  const prev = docs[index - 1];
  const next = docs[index + 1];

  return (
    <>
      <ContentHeader active="/docs" />
      <div className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-12 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-[190px_minmax(0,1fr)_190px]">
        {/* section nav */}
        <nav aria-label="Documentation" className="hidden lg:block">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Contents</p>
          <ul className="sticky top-24 mt-4 space-y-2.5 border-l border-black/8">
            {docs.map((d, i) => (
              <li key={d.slug}>
                <Link
                  href={`/docs/${d.slug}`}
                  aria-current={d.slug === slug ? "page" : undefined}
                  className={`-ml-px flex gap-2 border-l py-0.5 pl-3 text-[13px] leading-snug transition-colors ${
                    d.slug === slug
                      ? "border-accent text-zinc-900"
                      : "border-transparent text-zinc-500 hover:border-black/20 hover:text-zinc-900"
                  }`}
                >
                  <span className="font-mono text-[10px] leading-[1.5] text-zinc-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <article className="min-w-0">
          <Eyebrow>[Docs]</Eyebrow>
          <h1 className="mt-4 text-[38px] leading-[1.06] tracking-tighter text-zinc-900">{doc.title}</h1>
          {doc.summary && <p className="mt-4 text-[16.5px] leading-relaxed text-zinc-600">{doc.summary}</p>}
          <div className="prose-mosaic mt-12" dangerouslySetInnerHTML={{ __html: doc.html }} />

          <nav className="mt-20 grid gap-px border border-black/8 bg-black/8 sm:grid-cols-2">
            {prev ? (
              <Link href={`/docs/${prev.slug}`} className="bg-white p-5 hover:bg-zinc-50">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">← Previous</span>
                <span className="mt-1.5 block text-[15px] tracking-tight text-zinc-900">{prev.title}</span>
              </Link>
            ) : (
              <span className="bg-white p-5" />
            )}
            {next && (
              <Link href={`/docs/${next.slug}`} className="bg-white p-5 text-right hover:bg-zinc-50">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">Next →</span>
                <span className="mt-1.5 block text-[15px] tracking-tight text-zinc-900">{next.title}</span>
              </Link>
            )}
          </nav>
        </article>

        <TableOfContents headings={doc.headings} />
      </div>
      <ContentFooter />
    </>
  );
}
