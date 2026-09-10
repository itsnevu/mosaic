"use client";

import { useEffect, useState } from "react";
import type { Heading } from "@/lib/content";

/**
 * Sticky in-page navigation with a reading position marker.
 *
 * A fifteen-minute whitepaper with a static list of thirteen links tells you where you can go
 * but never where you are. The observer watches the top third of the viewport and marks the
 * section occupying it, using the rule and the ink weight the rest of the site already uses —
 * no new colour, no new shape.
 *
 * Renders nothing when a page has too few headings to need it.
 */
export default function TableOfContents({ headings }: { headings: Heading[] }) {
  const items = headings.filter((h) => h.level === 2);
  const [active, setActive] = useState<string | undefined>(items[0]?.id);

  useEffect(() => {
    if (items.length < 3) return;
    const nodes = items.map((h) => document.getElementById(h.id)).filter((n): n is HTMLElement => !!n);
    if (nodes.length === 0) return;

    // Track every heading's position rather than the last one to fire, so scrolling up
    // lands on the section you are actually in rather than the one you just left.
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = nodes.find((n) => visible.has(n.id));
        if (first) {
          setActive(first.id);
          return;
        }
        // Nothing in the band: fall back to the last heading scrolled past.
        const passed = nodes.filter((n) => n.getBoundingClientRect().top < 120);
        setActive(passed.length ? passed[passed.length - 1].id : nodes[0].id);
      },
      { rootMargin: "-100px 0px -66% 0px", threshold: 0 },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [items]);

  if (items.length < 3) return null;

  return (
    <nav aria-label="On this page" className="sticky top-24 hidden max-h-[calc(100vh-8rem)] overflow-y-auto lg:block">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">On this page</p>
      <ul className="mt-4 space-y-2.5 border-l border-black/8">
        {items.map((h) => {
          const current = h.id === active;
          return (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                aria-current={current ? "location" : undefined}
                className={`-ml-px block border-l py-0.5 pl-3 text-[13px] leading-snug transition-colors ${
                  current
                    ? "border-accent text-zinc-900"
                    : "border-transparent text-zinc-500 hover:border-black/20 hover:text-zinc-900"
                }`}
              >
                {h.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
