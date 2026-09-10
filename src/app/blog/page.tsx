import type { Metadata } from "next";
import Link from "next/link";
import { ContentFooter, ContentHeader, Eyebrow } from "@/components/ContentShell";
import { formatDate, getPosts } from "@/lib/content";

export const metadata: Metadata = {
  title: "Blog — Mosaic Capital",
  description: "Writing on stablecoin yield, allocation mechanics and what we find while building Mosaic.",
};

export default function BlogIndex() {
  const posts = getPosts();
  return (
    <>
      <ContentHeader active="/blog" />
      <main className="mx-auto max-w-[1200px] px-4 py-16 md:px-8 md:py-24">
        <Eyebrow>[Blog]</Eyebrow>
        <h1 className="mt-4 max-w-2xl text-4xl leading-[1.05] tracking-tighter text-zinc-900 md:text-5xl">
          Notes from building it.
        </h1>
        <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-zinc-600">
          Why stablecoin yield is distributed the way it is, how allocation actually behaves once
          capital arrives, and what we get wrong along the way.
        </p>

        <ul className="mt-14 border-t border-black/8">
          {posts.map((p) => (
            <li key={p.slug} className="border-b border-black/8">
              <Link
                href={`/blog/${p.slug}`}
                className="surface-raise group -mx-4 grid gap-3 px-4 py-8 md:-mx-6 md:grid-cols-[150px_minmax(0,1fr)] md:gap-8 md:px-6"
              >
                <span className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.18em] text-zinc-400 md:pt-1.5">
                  {formatDate(p.date)}
                  <span className="before:content-['_·_'] md:block md:before:content-none">{p.readingTime}</span>
                </span>
                <span>
                  <h2 className="text-[22px] leading-snug tracking-tight text-zinc-900 group-hover:text-accent">
                    {p.title}
                  </h2>
                  {p.summary && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-zinc-600">{p.summary}</p>}
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
