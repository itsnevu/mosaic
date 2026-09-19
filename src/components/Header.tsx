import Link from "next/link";
import { LINKS } from "@/lib/links";
import ConnectButton from "@/components/ConnectButton";
import Logo from "./Logo";
import { ArrowSquareOut, XLogo } from "./icons";
import VaultAddress from "./VaultAddress";

const NAV = [
  { href: "#how", label: "How it earns" },
  { href: "#allocation", label: "Allocation" },
  { href: "/docs", label: "Docs" },
  { href: "/whitepaper", label: "Whitepaper" },
  { href: "/blog", label: "Blog" },
  { href: "#faq", label: "FAQ" },
];

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <Link className="inline-flex items-center gap-2.5 sm:gap-3" href="/">
      <Logo size={size} />
      <span className="font-mono text-[10px] tracking-[0.16em] sm:text-xs sm:tracking-[0.22em] text-zinc-900">
        Mosaic
      </span>
    </Link>
  );
}

export default function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-black/8 bg-background/80 shadow-[inset_0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 md:px-8">
        <Wordmark />
        <nav className="hidden items-center gap-8 text-sm text-zinc-600 md:flex">
          {NAV.map((n) => (
            <a key={n.label} href={n.href} className="hover:text-zinc-900">
              {n.label}
            </a>
          ))}
          <span className="hidden items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-600 xl:inline-flex">
            <span className="text-zinc-500">Vault address</span>
            <VaultAddress className="text-zinc-800" />
            <ArrowSquareOut className="h-3 w-3" />
          </span>
        </nav>
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="hidden sm:block">
            <div className="flex flex-wrap gap-2.5">
              <a
                href={LINKS.x}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2.5 border border-black/8 px-4 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-700 transition-colors hover:border-accent hover:text-accent"
              >
                <XLogo />
                <span>Twitter</span>
              </a>
            </div>
          </div>
          <span className="relative inline-flex">
            <span className="pointer-events-none absolute -left-1.5 top-1/2 h-3 w-1.5 -translate-y-1/2 bg-accent"></span>
            <span className="pointer-events-none absolute -right-1.5 top-1/2 h-3 w-1.5 -translate-y-1/2 bg-accent"></span>
            <ConnectButton
              className="inline-flex items-center justify-center bg-accent px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-50 transition-colors hover:bg-accent-press active:scale-[0.98] sm:px-7 sm:py-3"
              label="Connect wallet"
            />
          </span>
        </div>
      </div>
      <nav className="flex gap-5 overflow-x-auto border-t border-black/8 px-4 py-2.5 text-sm text-zinc-600 md:hidden">
        {NAV.map((n) => (
          <a key={n.label} href={n.href} className="-my-2 shrink-0 py-2 hover:text-zinc-900">
            {n.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
