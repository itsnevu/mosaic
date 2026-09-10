import Link from "next/link";

export const metadata = { title: "Terms — Mosaic Capital" };

export default function Page() {
  return (
    <main className="mx-auto max-w-[72ch] px-4 py-16 md:px-8 md:py-24">
      <Link href="/" className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-900">
        ← Mosaic Capital
      </Link>
      <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.22em] text-accent">[Legal]</p>
      <h1 className="mt-4 text-4xl tracking-tighter text-zinc-900">Terms</h1>
      <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-zinc-600">
        <p>Mosaic Capital is software, not a financial institution. It is provided as is, without warranty. Using it means you accept that responsibility for your own funds stays with you.</p>
        <p>The protocol is in open beta and carries a deposit cap while it proves itself. Contracts may be paused, parameters may be adjusted, and pools may be added or removed. Withdrawals are never blocked by a pause.</p>
        <p>Nothing on this site is investment advice, a solicitation, or a promise of return. Yield figures are historical or illustrative and describe what pools have paid, not what they will pay. Any rate can fall to zero.</p>
        <p>You may lose money. Capital is supplied to third party lending pools, and a failure in one of those pools puts the portion allocated to it at risk. Per pool caps limit that exposure but do not eliminate it.</p>
        <p>You are responsible for your own tax position and for complying with the laws that apply where you live. Access may be restricted in some jurisdictions.</p>
        <p>Questions: support@mosaic.capital</p>
      </div>
      <p className="mt-12 border-t border-black/8 pt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
        Last updated 10 September 2026
      </p>
    </main>
  );
}
