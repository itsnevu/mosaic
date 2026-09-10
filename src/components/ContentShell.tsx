import Link from "next/link";
import Logo from "@/components/Logo";
export { default as TableOfContents } from "@/components/TableOfContents";

const NAV = [
  { href: "/docs", label: "Docs" },
  { href: "/whitepaper", label: "Whitepaper" },
  { href: "/blog", label: "Blog" },
] as const;

/** Header shared by every long-form page, deliberately quieter than the landing header. */
export function ContentHeader({ active }: { active?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-black/8 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-4 px-4 md:gap-6 md:px-8">
        <Link href="/" className="inline-flex shrink-0 items-center gap-2.5 text-zinc-900">
          <Logo size={18} />
          <span className="text-[15px] font-medium tracking-tight">Mosaic</span>
        </Link>
        <nav className="hidden items-center gap-5 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500 sm:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active === n.href ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap py-2 ${active === n.href ? "text-zinc-900" : "hover:text-zinc-900"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/app"
          className="ml-auto inline-flex h-8 shrink-0 items-center whitespace-nowrap border border-zinc-900 bg-zinc-900 px-3.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white hover:bg-zinc-700"
        >
          Open app
        </Link>
      </div>
      <nav className="flex gap-5 overflow-x-auto border-t border-black/8 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500 sm:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active === n.href ? "page" : undefined}
            className={`-my-1.5 shrink-0 py-1.5 ${active === n.href ? "text-zinc-900" : "hover:text-zinc-900"}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function ContentFooter() {
  return (
    <footer className="mt-24 border-t border-black/8">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-6 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500 sm:flex-row sm:items-center sm:justify-between md:px-8">
        <span>© 2026 Mosaic Capital · One deposit. Many sources of yield.</span>
        <span className="flex gap-5">
          <Link href="/privacy" className="-my-2 py-2 hover:text-zinc-900">Privacy</Link>
          <Link href="/terms" className="-my-2 py-2 hover:text-zinc-900">Terms</Link>
          <Link href="/app" className="-my-2 py-2 hover:text-zinc-900">App</Link>
        </span>
      </div>
    </footer>
  );
}

/** The small mono eyebrow used above every long-form title. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">{children}</p>;
}
