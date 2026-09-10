"use client";

import { useState } from "react";
import { CloseX } from "./icons";

export default function NoticeBar() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div
      role="status"
      className="relative border-b border-amber-500/40 bg-amber-50 px-10 py-2.5 text-center font-mono text-[11px] leading-relaxed tracking-[0.04em] text-amber-900"
    >
      <p className="mx-auto max-w-[72ch] text-balance">
        Mosaic is in open beta. Vault caps apply while the system proves itself.
      </p>
      <button
        type="button"
        aria-label="Dismiss beta notice"
        onClick={() => setOpen(false)}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-amber-700 transition-colors hover:bg-amber-500/15 hover:text-amber-950"
      >
        <CloseX className="h-4 w-4" />
      </button>
    </div>
  );
}
