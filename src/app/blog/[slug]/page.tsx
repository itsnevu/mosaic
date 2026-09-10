import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentFooter, ContentHeader, Eyebrow, TableOfContents } from "@/components/ContentShell";
import { formatDate, getPost, getPosts } from "@/lib/content";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Blog — Mosaic Capital" };
  return { title: `${post.title} — Mosaic Capital`, description: post.summary };
}

export default async function PostPage({ params }: Params) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const others = getPosts().filter((p) => p.slug !== slug).slice(0, 2);

  return (
    <>
      <ContentHeader active="/blog" />
      <div className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-12 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-[minmax(0,1fr)_200px]">
        <article className="mx-auto w-full min-w-0 max-w-[70ch]">
          <Eyebrow>[Blog]</Eyebrow>
          <h1 className="mt-4 text-[38px] leading-[1.06] tracking-tighter text-zinc-900 md:text-[44px]">
            {post.title}
          </h1>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
            {formatDate(post.date)} · {post.readingTime}
          </p>
          {post.summary && (
            <p className="mt-6 border-l-2 border-accent pl-4 text-[17px] leading-relaxed text-zinc-600">
              {post.summary}
            </p>
          )}
          <div className="prose-mosaic mt-12" dangerouslySetInnerHTML={{ __html: post.html }} />

          {others.length > 0 && (
            <section className="mt-20 border-t border-black/8 pt-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Keep reading</p>
              <ul className="mt-5 space-y-4">
                {others.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/blog/${p.slug}`} className="group block">
                      <span className="text-[17px] tracking-tight text-zinc-900 group-hover:text-accent">{p.title}</span>
                      <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                        {formatDate(p.date)} · {p.readingTime}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>

        <TableOfContents headings={post.headings} />
      </div>
      <ContentFooter />
    </>
  );
}
