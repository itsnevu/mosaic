"use client";

import { useState } from "react";
import { CaretDown } from "./icons";

export type QA = { q: string; a: string };

export default function Faq({ items }: { items: QA[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto max-w-[1400px] border-t border-black/8">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={it.q} className="border-b border-black/8">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-6 px-4 py-6 text-left md:px-8"
            >
              <span className="text-base tracking-tight text-zinc-900 sm:text-lg">{it.q}</span>
              <span
                className="shrink-0 text-zinc-500 transition-transform duration-200"
                style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
              >
                <CaretDown />
              </span>
            </button>
            {isOpen && (
              <div className="px-4 pb-8 md:px-8">
                <p className="max-w-[65ch] text-base leading-relaxed text-zinc-600">{it.a}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
