import type { Metadata } from "next";
import Link from "next/link";
import { ContentFooter, ContentHeader, Eyebrow } from "@/components/ContentShell";
import { LINKS } from "@/lib/links";

export const metadata: Metadata = {
  title: "Terms — Mosaic Capital",
  description: "Mosaic is software, not a financial institution. What that means for you.",
};

export default function Page() {
  return (
    <>
      <ContentHeader />
      <main className="mx-auto max-w-[72ch] px-4 py-16 md:px-8 md:py-24">
        <Eyebrow>[Legal]</Eyebrow>
        <h1 className="mt-4 text-4xl leading-[1.06] tracking-tighter text-zinc-900">Terms</h1>
        <div className="prose-mosaic mt-10">
          <p>
            Mosaic Capital is software, not a financial institution. It is provided as is, without
            warranty. Using it means you accept that responsibility for your own funds stays with
            you.
          </p>
          <p>
            The protocol is in open beta and carries a deposit cap while it proves itself.
            Contracts may be paused, parameters may be adjusted, and pools may be added or removed.
            Withdrawals are never blocked by a pause.
          </p>
          <p>
            Nothing on this site is investment advice, a solicitation, or a promise of return.
            Yield figures are live or illustrative and describe what pools are paying, not what
            they will pay. Any rate can fall to zero.
          </p>
          <p>
            You may lose money. Capital is supplied to third party lending pools, and a failure in
            one of those pools puts the portion allocated to it at risk. Per pool caps limit that
            exposure but do not eliminate it.
          </p>
          <p>
            The contracts have not been audited by a third party. What exists instead is written
            down: the trust model, the invariants and the known gaps are published in the{" "}
            <Link href="/docs/security">security notes</Link>.
          </p>
          <p>
            You are responsible for your own tax position and for complying with the laws that
            apply where you live. Access may be restricted in some jurisdictions.
          </p>
          <p>
            Questions:{" "}
            {LINKS.support ? (
              <a href={`mailto:${LINKS.support}`}>{LINKS.support}</a>
            ) : (
              <>
                open an issue on the repository, or reach us through the channels linked from the{" "}
                <Link href="/docs">docs</Link>.
              </>
            )}
          </p>
        </div>
        <p className="mt-14 border-t border-black/8 pt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
          Last updated 10 September 2026
        </p>
      </main>
      <ContentFooter />
    </>
  );
}
