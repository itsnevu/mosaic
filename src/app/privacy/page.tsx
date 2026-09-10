import type { Metadata } from "next";
import Link from "next/link";
import { ContentFooter, ContentHeader, Eyebrow } from "@/components/ContentShell";
import { LINKS } from "@/lib/links";

export const metadata: Metadata = {
  title: "Privacy — Mosaic Capital",
  description: "What Mosaic sees, what it does not ask for, and what is public by design.",
};

export default function Page() {
  return (
    <>
      <ContentHeader />
      <main className="mx-auto max-w-[72ch] px-4 py-16 md:px-8 md:py-24">
        <Eyebrow>[Legal]</Eyebrow>
        <h1 className="mt-4 text-4xl leading-[1.06] tracking-tighter text-zinc-900">Privacy</h1>
        <div className="prose-mosaic mt-10">
          <p>
            Mosaic does not ask for your name, email, or documents, and there is no account to
            create. Connecting a wallet does not send us personal information.
          </p>
          <p>
            What the site sees: your public wallet address when you connect it, and standard
            request data such as your IP address and browser type, which any web server receives.
            We use that only to serve the site and to spot abuse.
          </p>
          <p>
            What happens on chain is public by design. Deposits, withdrawals, share balances and
            rebalances are recorded on a public blockchain, are readable by anyone, and cannot be
            deleted by us or by you.
          </p>
          <p>
            Your browser talks directly to an RPC provider and to your wallet extension. Those
            parties have their own policies and may see your address and requests.
          </p>
          <p>We do not sell data, and we do not run advertising or cross site tracking.</p>
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
