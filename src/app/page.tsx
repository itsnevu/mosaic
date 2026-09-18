import Link from "next/link";
import { LINKS } from "@/lib/links";
import { HeroStats } from "@/components/HeroStats";
import NoticeBar from "@/components/NoticeBar";
import Header, { Wordmark } from "@/components/Header";
import LiveMath from "@/components/LiveMath";
import VaultAddress from "@/components/VaultAddress";
import { BlendedApyFigure, PoolCountLabel } from "@/components/LiveFigures";
import WorkedExample from "@/components/WorkedExample";
import AllocationTape from "@/components/AllocationTape";
import Faq, { type QA } from "@/components/Faq";
import { ArrowsClockwise, Icon, XLogo, type IconName } from "@/components/icons";
import { MosaicField } from "@/components/fx/MosaicFieldLoader";
import { RuleNumbers } from "@/components/RuleNumbers";

/* ------------------------------------------------------------------ data */

type Card = { icon: IconName; title: string; body: string };

const HOW_CARDS: Card[] = [
  {
    icon: "wallet",
    title: "Deposit USDG once",
    body: "That is your entire job. One approval, one transaction. The vault does the rest and there is nothing to configure.",
  },
  {
    icon: "coins",
    title: "Receive shares, not rewards",
    body: "You get deposit ÷ price-per-share in shares. Yield arrives as that price rising. Same shares in month six, worth more USDG.",
  },
  {
    icon: "hash",
    title: "Batched deployment",
    body: "Deposits gather in an idle buffer and enter pools in batches, so gas is shared across the batch. Small depositors get large-depositor economics.",
  },
  {
    icon: "scales",
    title: "Spread by risk-adjusted score",
    body: "Every pool sits behind an adapter and is scored on liquidity, utilization, rate volatility and age. Weights follow the score, never the headline APY.",
  },
  {
    icon: "arrowsClockwise",
    title: "Rebalance only when it pays",
    body: "A keeper closes the gap to target only when the extra yield beats gas and slippage. Drift under the threshold sits. A cooldown stops oscillation.",
  },
  {
    icon: "arrowsLeftRight",
    title: "Withdraw from the buffer, instantly",
    body: "Ordinary redemptions are served from the buffer without touching a pool. Larger ones unwind in a defined order, filled in full or reverted.",
  },
];

const ENGINE_CARDS: Card[] = [
  {
    icon: "scales",
    title: "Score by liquidity & utilization",
    body: "How deep the pool is, how large you would be inside it, and how much is already borrowed. A pool at 99% utilization pays well because nobody can leave.",
  },
  {
    icon: "chartLineUp",
    title: "Price the post-deposit rate",
    body: "Supplying capital lowers utilization, which lowers the rate. The engine optimizes for what the vault will actually receive after the allocation exists.",
  },
  {
    icon: "arrowLineUp",
    title: "Cap every pool",
    body: "No pool exceeds a maximum share of the vault regardless of score. Each adapter passes an audit and an observation period at limited size first.",
  },
  {
    icon: "clock",
    title: "Cooldown between moves",
    body: "Rebalances clear a deviation threshold and a hard cooldown. Spikes are usually one borrower leaving an hour later. Allocation follows sustained change, not noise.",
  },
];

const VAULT_SCREENS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "wallet",
    title: "Deposit",
    body: "Approve USDG, mint shares at the current price per share. Your deposit joins the next batched deployment.",
  },
  {
    icon: "hash",
    title: "Allocation",
    body: "Where every dollar sits right now, pool by pool, with current weight against target weight so you can see when a rebalance is pending.",
  },
  {
    icon: "fileText",
    title: "History",
    body: "Every allocation change with its timestamp, the rates that triggered it, and what it cost to execute.",
  },
  {
    icon: "arrowsLeftRight",
    title: "Withdraw",
    body: "Burn shares, receive USDG. Current withdrawal capacity is shown before you need it, not after.",
  },
];


const RISKS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "stack",
    title: "Underlying pools",
    body: "Mosaic supplies USDG to lending protocols. If one suffers a critical failure, the capital in that pool is at risk. This is why allocation is spread and capped: a failing pool should scratch the portfolio, not erase it.",
  },
  {
    icon: "shield",
    title: "Mosaic's contracts",
    body: "Pooled capital is a target. The mitigation is a small core that does not change, complexity pushed into adapters that can be disabled individually, independent audits, a conservative deposit cap, and an emergency withdraw path.",
  },
  {
    icon: "scales",
    title: "Allocation model",
    body: "A model can be well-built and still misjudge, so it is bounded rather than trusted. Weight ceilings, pool caps, cooldowns and profitability checks make a bad decision expensive to no one and survivable by everyone.",
  },
];

const FAQ: QA[] = [
  {
    q: "What is the share price?",
    a: "The vault holds one number, total assets, against one supply of shares. Price per share is assets divided by shares. When you deposit you receive deposit ÷ price in shares; as pools pay interest, assets grow and the price rises. Your entry never dilutes anyone and theirs never dilutes you.",
  },
  {
    q: "Do I have to claim anything?",
    a: "No. There is no claim button anywhere in Mosaic. Yield is not a separate token you harvest; it is the price per share rising. You hold the same shares in month six that you held on day one, and they are simply worth more USDG. Interest compounds without a single transaction from you.",
  },
  {
    q: "What happens if a pool fails?",
    a: "Capital in that specific pool is at risk, which is exactly why no pool may exceed the maximum weight and each carries a cap defined by its own depth. A pool failing scratches a portion of the portfolio rather than erasing it, and an emergency path can pull funds from a compromised adapter back to the vault.",
  },
  {
    q: "How do withdrawals work?",
    a: "You redeem shares; the vault burns them and returns USDG at the current price per share. Ordinary withdrawals are served instantly from the idle buffer. Larger ones unwind positions from the cheapest exit first and never partially fill: you receive the full amount or the transaction reverts and you keep your shares.",
  },
  {
    q: "What are the fees?",
    a: "A performance fee on yield generated, never on principal, realized inside the price per share rather than as a separate charge. If the vault does not earn, the fee does not apply. Nobody at Mosaic is paid for your money sitting still.",
  },
  {
    q: "Is this trading?",
    a: "No. No leverage, no charts, no shorts, no debt. Mosaic supplies capital to lending markets and nothing else, so there is no borrowed position and nothing to liquidate. It is built for people who want their money working while they get on with their lives.",
  },
];

/* --------------------------------------------------------------- pieces */

function Tag({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <p
      className={
        "font-mono text-[11px] uppercase tracking-[0.22em] " + (muted ? "text-zinc-500" : "text-accent")
      }
    >
      {children}
    </p>
  );
}

/* Accrued's 12-col numbered card grid: rows alternate 7/5 then 5/7. */
function NumberedCards({ cards, titleMax = "max-w-[16ch]" }: { cards: Card[]; titleMax?: string }) {
  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 border-t border-black/8 md:grid-cols-12">
      {cards.map((c, i) => {
        const n = String(i + 1).padStart(2, "0");
        const row = Math.floor(i / 2);
        const left = i % 2 === 0;
        const wide = row % 2 === 0 ? left : !left;
        const span = (wide ? "md:col-span-7" : "md:col-span-5") + (left ? " md:border-r" : " ");
        return (
          <article
            key={c.title}
            className={`group relative overflow-hidden border-b border-black/8 px-4 py-12 md:px-8 md:py-14 ${span}`}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-2 top-4 font-mono text-7xl tracking-tighter text-black/[0.05] transition-transform duration-500 group-hover:translate-x-[-6px] md:text-8xl"
            >
              {n}
            </span>
            <div className="relative flex items-center gap-3">
              <Icon name={c.icon} className="text-accent" />
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">{n}</p>
            </div>
            <h3 className={`relative mt-5 ${titleMax} text-2xl tracking-tight text-zinc-900`}>{c.title}</h3>
            <p className="relative mt-3 max-w-[46ch] text-base leading-relaxed text-zinc-600">{c.body}</p>
            <span className="absolute bottom-0 left-0 h-px w-16 origin-left scale-x-0 bg-accent transition-transform group-hover:scale-x-100"></span>
          </article>
        );
      })}
    </div>
  );
}

function RailCell({
  tag,
  title,
  body,
  last = false,
}: {
  tag: string;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <div className={last ? "px-4 py-10 md:px-8" : "border-b border-black/8 px-4 py-10 md:px-8"}>
      <Tag muted>{tag}</Tag>
      <p className="mt-3 text-xl tracking-tight text-zinc-900">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">{body}</p>
    </div>
  );
}

const outlineBtnBase =
  "border border-black/12 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-800 transition-colors hover:border-black/25 hover:text-zinc-950 active:scale-[0.98]";
const outlineBtn = "inline-flex items-center justify-center " + outlineBtnBase;

/* ----------------------------------------------------------------- page */

export default function Home() {
  return (
    <div className="min-h-full overflow-x-clip bg-background font-sans text-zinc-800">
      <NoticeBar />
      <div className="min-h-[100dvh]">
        <Header />

        <main>
          {/* ============================== [01] HERO */}
          <section className="relative overflow-hidden border-b border-black/8">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 desk-glass-canvas opacity-60"></div>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 wallet-grid-bg opacity-[0.35]"></div>
            <MosaicField />
            <div className="relative mx-auto grid min-h-[min(100dvh,920px)] max-w-[1400px] grid-cols-1 items-center gap-12 px-4 py-14 sm:py-16 md:grid-cols-[1.08fr_0.92fr] md:gap-10 md:px-8 md:py-20">
              <div className="min-w-0">
                <Tag>[01] Auto-optimized yield</Tag>
                <h1 className="mt-5 max-w-[13ch] text-4xl tracking-tighter leading-[0.95] text-zinc-900 sm:text-5xl md:text-[4.25rem] md:leading-none">
                  One deposit.
                  <br />
                  Every yield.
                </h1>
                <p className="mt-6 max-w-[58ch] text-base leading-relaxed text-zinc-600 md:text-[17px] md:leading-relaxed">
                  Deposit USDG once. Mosaic spreads it across many lending pools, reweights when it pays to, and
                  reports every move. No claim button — your share price simply rises.
                </p>

                <HeroStats />

                <div className="mt-10 flex flex-wrap items-center gap-4">
                  <Link href="/app" className="group relative inline-flex items-center justify-center outline-none">
                    <span className="relative z-10 inline-flex w-[min(228px,calc(100vw-48px))] items-center justify-center border border-black/35 bg-raised px-6 py-3 font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-100 transition-transform group-active:scale-[0.98] sm:px-8">
                      Deposit USDG
                    </span>
                  </Link>
                  <a className={outlineBtn} href="#how">
                    How it earns
                  </a>
                </div>

                <div className="mt-10">
                  <LiveMath />
                </div>

                <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                  Shares are ERC-4626 · readable by any wallet
                </p>
              </div>

              <div className="mx-auto w-full max-w-[480px] md:mx-0 md:justify-self-end md:pt-4">
                <AllocationTape />
              </div>
            </div>
          </section>

          {/* ============================== wallet strip */}
          <section className="border-t border-black/8">
            <div className="mx-auto grid max-w-[1400px] grid-cols-2 md:grid-cols-6">
              {["MetaMask", "Phantom", "Coinbase", "Robinhood"].map((w) => (
                <div
                  key={w}
                  className="border-b border-black/8 px-4 py-6 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500 odd:border-r md:border-b-0 md:border-r md:last:border-r-0"
                >
                  {w}
                </div>
              ))}
            </div>
          </section>

          {/* ============================== [04] HOW IT EARNS */}
          <section id="how" className="scroll-mt-16 border-t border-black/8">
            <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-end gap-10 px-4 py-16 md:grid-cols-[1.2fr_0.8fr] md:px-8 md:py-24">
              <div>
                <Tag>[04] How it earns</Tag>
                <h2 className="mt-5 max-w-[14ch] text-4xl tracking-tighter leading-none text-zinc-900 md:text-6xl">
                  Deposit in. Yield out.
                </h2>
              </div>
              <p className="max-w-[42ch] text-base leading-relaxed text-zinc-600">
                One deposit is priced once into shares. Adapters spread it across lending pools, a bounded engine
                reweights it, and the price per share carries the result. Six steps, one ledger, nothing to claim.
              </p>
            </div>

            <NumberedCards cards={HOW_CARDS} />

            {/* worked example */}
            <div className="border-t border-black/8">
              <div className="mx-auto grid max-w-[1400px] grid-cols-1 md:grid-cols-[1.35fr_0.65fr]">
                <div className="border-b border-black/8 px-4 py-16 md:border-b-0 md:border-r md:px-8 md:py-20">
                  <Tag muted>Worked example</Tag>
                  <WorkedExample />
                </div>
                <div className="grid grid-rows-2">
                  <RailCell tag="Share rail" title="No claim button." body="Yield is the price per share rising. Same shares, worth more USDG. Nothing to harvest, nothing to remember." />
                  <RailCell tag="Exit rail" title="Buffer first, then unwind." body="Ordinary redemptions clear from the idle buffer instantly. Larger ones unwind pools cheapest-exit first, filled in full or reverted." last />
                </div>
              </div>
            </div>
          </section>

          {/* ============================== [05] ALLOCATION ENGINE */}
          <section id="allocation" className="scroll-mt-16 border-t border-black/8">
            <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-end gap-10 px-4 py-16 md:grid-cols-[1.15fr_0.85fr] md:px-8 md:py-24">
              <div>
                <Tag>[05] Allocation engine</Tag>
                <h2 className="mt-5 max-w-[14ch] text-4xl tracking-tighter leading-none text-zinc-900 md:text-6xl">
                  Rules, not vibes.
                </h2>
              </div>
              <div className="space-y-4">
                <p className="max-w-[44ch] text-base leading-relaxed text-zinc-600">
                  Every pool carries a risk-adjusted score built from what can be measured on-chain. Weights follow
                  the score, hard ceilings override the weights, and the keeper only moves when the move pays.
                </p>
                <p className="inline-flex items-center gap-2 border border-accent/30 bg-accent/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                  <ArrowsClockwise />
                  Live now
                </p>
              </div>
            </div>

            <NumberedCards cards={ENGINE_CARDS} titleMax="max-w-[18ch]" />

            {/* the loop */}
            <div className="border-t border-black/8">
              <div className="mx-auto grid max-w-[1400px] grid-cols-1 md:grid-cols-[1.35fr_0.65fr]">
                <div className="border-b border-black/8 px-4 py-16 md:border-b-0 md:border-r md:px-8 md:py-20">
                  <Tag muted>The loop</Tag>
                  <p className="mt-6 font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">
                    Post-deposit rate, not headline rate
                  </p>
                  <p className="mt-3 font-mono text-4xl tabular-nums tracking-tighter text-money sm:text-5xl md:text-6xl">
                    Spread thin. Earn more.
                  </p>
                  <p className="mt-6 max-w-[54ch] text-base leading-relaxed text-zinc-600">
                    Supplying capital lowers utilization, which lowers the rate. Yield curves flatten as you push into
                    them, so one pool is usually worse than several before risk is even counted. Spreading lets each
                    position sit on the steeper part of its own curve.
                  </p>
                  <Link className={"mt-8 inline-block " + outlineBtnBase} href="/app">
                    Open vault
                  </Link>
                </div>
                <div className="grid grid-rows-2">
                  <RailCell tag="Who moves it" title="A keeper, bounded." body="Anyone can trigger it. It cannot send funds outside registered adapters, exceed a ceiling, or skip the cooldown. Its freedom is when, never where." />
                  <RailCell tag="Why it holds" title="Min-output or revert." body="Every rebalance carries an on-chain minimum-output check. A move that would execute worse than expected reverts instead of completing at a bad price." last />
                </div>
              </div>
            </div>
          </section>

          {/* ============================== [06] THE VAULT */}
          <section id="vault" className="scroll-mt-16 border-t border-black/8">
            <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-end gap-10 px-4 py-16 md:grid-cols-[0.85fr_1.15fr] md:px-8 md:py-24">
              <p className="max-w-[40ch] text-base leading-relaxed text-zinc-600 md:order-2">
                Automation without visibility is a black box. The vault is four screens, and every one of them shows
                the number you would otherwise have to trust.
              </p>
              <div className="md:order-1">
                <Tag>[06] The vault</Tag>
                <h2 className="mt-5 max-w-[12ch] text-4xl tracking-tighter leading-none text-zinc-900 md:text-6xl">
                  Four screens. Nothing hidden.
                </h2>
              </div>
            </div>
            <div className="mx-auto grid max-w-[1400px] grid-cols-1 border-t border-black/8 md:grid-cols-12">
              {VAULT_SCREENS.map((s, i) => {
                const left = i % 2 === 0;
                const wide = Math.floor(i / 2) % 2 === 0 ? left : !left;
                const span = (wide ? "md:col-span-7" : "md:col-span-5") + (left ? " md:border-r" : " ");
                return (
                  <article key={s.title} className={`border-b border-black/8 px-4 py-12 md:px-8 md:py-14 ${span}`}>
                    <Icon name={s.icon} className="text-accent" />
                    <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      {String(i + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mt-3 text-2xl tracking-tight text-zinc-900">{s.title}</h3>
                    <p className="mt-3 max-w-[46ch] text-base leading-relaxed text-zinc-600">{s.body}</p>
                    <Link
                      className="mt-6 inline-block py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-700 hover:text-zinc-900"
                      href="/app"
                    >
                      Open →
                    </Link>
                  </article>
                );
              })}
            </div>
          </section>

          {/* ============================== [07] PUBLISHED NUMBERS */}
          <section id="numbers" className="scroll-mt-16 border-t border-black/8">
            <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-10 px-4 py-16 md:grid-cols-[1.2fr_0.8fr] md:px-8 md:py-24">
              <div>
                <Tag>[07] Published numbers</Tag>
                <h2 className="mt-5 max-w-[14ch] text-4xl tracking-tighter leading-none text-zinc-900 md:text-6xl">
                  The rule set is the product.
                </h2>
              </div>
              <p className="max-w-[42ch] self-end text-base leading-relaxed text-zinc-600">
                Ceilings, buffer, threshold and fee are the live allocation rule. They can be tightened. The keeper
                cannot step around them.
              </p>
            </div>
            <div className="mx-auto grid max-w-[1400px] grid-cols-1 border-t border-black/8 md:grid-cols-2">
              <RuleNumbers />
            </div>
          </section>

          {/* ============================== [08] WHERE THE RISK LIVES */}
          <section id="risk" className="scroll-mt-16 border-t border-black/8">
            <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-end gap-10 px-4 py-16 md:grid-cols-[1.15fr_0.85fr] md:px-8 md:py-24">
              <div>
                <Tag>[08] Where the risk lives</Tag>
                <h2 className="mt-5 max-w-[16ch] text-4xl tracking-tighter leading-none text-zinc-900 md:text-6xl">
                  Three failure modes. Named.
                </h2>
              </div>
              <p className="max-w-[44ch] text-base leading-relaxed text-zinc-600">
                Anyone describing a yield product without naming its failure modes is describing a brochure. There
                are three real ones, and each has a bounded answer.
              </p>
            </div>
            <div className="mx-auto grid max-w-[1400px] grid-cols-1 border-t border-black/8 md:grid-cols-3">
              {RISKS.map((r, i) => (
                <article
                  key={r.title}
                  className="border-b border-black/8 px-4 py-12 md:border-r md:px-8 md:py-14 md:last:border-r-0"
                >
                  <div className="flex items-center gap-3">
                    <Icon name={r.icon} className="text-accent" />
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
                      {String(i + 1).padStart(2, "0")}
                    </p>
                  </div>
                  <h3 className="mt-5 max-w-[16ch] text-2xl tracking-tight text-zinc-900">{r.title}</h3>
                  <p className="mt-3 max-w-[46ch] text-base leading-relaxed text-zinc-600">{r.body}</p>
                </article>
              ))}
            </div>
          </section>

          {/* ============================== [09] QUESTIONS */}
          <section id="faq" className="scroll-mt-16 border-t border-black/8">
            <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-end gap-10 px-4 py-16 md:grid-cols-[1fr_1.2fr] md:px-8 md:py-24">
              <div>
                <Tag>[09] Questions</Tag>
                <h2 className="mt-5 max-w-[12ch] text-4xl tracking-tighter leading-none text-zinc-900 md:text-6xl">
                  Before you deposit.
                </h2>
              </div>
              <p className="max-w-[44ch] text-base leading-relaxed text-zinc-600">
                Short answers. The share price does not invent a second story after you sign.
              </p>
            </div>
            <Faq items={FAQ} />
            <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-8">
              <Link
                className="inline-flex min-h-11 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-600 transition-colors hover:text-zinc-900"
                href="/docs"
              >
                Full docs <span aria-hidden>→</span>
              </Link>
            </div>
          </section>
        </main>
      </div>

      {/* ============================== FOOTER (black bar) */}
      <footer className="relative isolate overflow-hidden border-t border-black/8 bg-raised text-zinc-200">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 footer-dots opacity-60"></div>
        <div className="relative z-10 mx-auto grid max-w-[1400px] grid-cols-1 gap-12 px-4 py-16 md:grid-cols-2 md:px-8 md:py-20 lg:grid-cols-[1.1fr_0.95fr_0.85fr] lg:items-start lg:gap-16">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">[10] Close</p>
            <div className="mt-5 text-zinc-50">
              <span className="inline-flex items-center gap-2.5 sm:gap-3 [&_span]:text-zinc-50">
                <Wordmark size={36} />
              </span>
            </div>
            <h2 className="mt-8 max-w-[14ch] text-4xl tracking-tighter leading-none text-zinc-50 md:text-5xl">
              Many fragments. One picture.
            </h2>
            <p className="mt-5 max-w-[46ch] text-base leading-relaxed text-zinc-400">
              Deposit once. Shares grow in value while adapters spread the capital across many lending pools and a
              bounded engine reweights it only when the move pays for itself. Nothing is hidden.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                className="group relative inline-flex items-center justify-center bg-zinc-50 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-900 transition-colors hover:bg-zinc-200 active:scale-[0.98] sm:px-7 sm:py-3"
                href="/app"
              >
                <span className="absolute -left-1.5 top-1/2 h-3 w-1.5 -translate-y-1/2 bg-zinc-50 group-hover:bg-zinc-200"></span>
                <span className="absolute -right-1.5 top-1/2 h-3 w-1.5 -translate-y-1/2 bg-zinc-50 group-hover:bg-zinc-200"></span>
                Open vault
              </Link>
              <Link
                href="/docs"
                className="inline-flex items-center justify-center border border-white/12 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-200 transition-colors hover:border-zinc-50 hover:text-zinc-50 focus-visible:border-zinc-50 focus-visible:outline-none active:scale-[0.98]"
              >
                Read the docs
              </Link>
            </div>
            <div className="mt-10">
              <div className="flex flex-wrap gap-2.5">
                <a
                  href={LINKS.x}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center gap-2.5 border border-white/8 px-4 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-300 transition-colors hover:border-zinc-50 hover:text-zinc-50 focus-visible:border-zinc-50 focus-visible:outline-none"
                >
                  <XLogo />
                  <span>Twitter</span>
                </a>
              </div>
            </div>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6 md:gap-10">
            {[
              { h: "Product", links: [["#how", "How it earns"], ["#allocation", "Allocation"], ["#numbers", "Numbers"], ["#", "Docs"]] },
              { h: "Vault", links: [["/app", "Connect wallet"], ["/app", "Deposit"], ["/app", "History"], ["/app", "Withdraw"]] },
              { h: "Legal", links: [["#faq", "FAQ"], ["#", "Vault contract"], ["#", "Privacy"], ["#", "Terms"]] },
            ].map((col) => (
              <div key={col.h}>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">{col.h}</p>
                <ul className="mt-5 space-y-3">
                  {col.links.map(([href, label]) => (
                    <li key={label}>
                      <a
                        className="-my-2.5 py-2.5 text-sm text-zinc-400 transition-colors hover:text-zinc-50 focus-visible:text-zinc-50 focus-visible:outline-none"
                        href={href}
                      >
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="md:col-span-2 lg:col-span-1">
            <aside className="relative border border-white/8 bg-white/5 px-5 py-6 md:px-6 md:py-7">
              <span className="absolute -left-px -top-px h-3 w-3 border-l border-t border-zinc-50"></span>
              <span className="absolute -right-px -top-px h-3 w-3 border-r border-t border-zinc-50"></span>
              <span className="absolute -bottom-px -left-px h-3 w-3 border-b border-l border-zinc-50"></span>
              <span className="absolute -bottom-px -right-px h-3 w-3 border-b border-r border-zinc-50"></span>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-50">[07] Published numbers</p>
              <div className="mt-6 flex items-end justify-between gap-6">
                <div>
                  <PoolCountLabel className="whitespace-nowrap block font-mono text-xl tracking-tight text-zinc-50" />
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">One deposit, then the spread</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-4xl tabular-nums tracking-tighter text-money"><BlendedApyFigure /></p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">% APY</p>
                </div>
              </div>
              <dl className="mt-8 divide-y divide-white/8 border-t border-white/8">
                {[
                  ["Max pool weight", "40%"],
                  ["Idle buffer", "5–8%"],
                  ["Cooldown", "24h"],
                  ["Fee", "10% of yield"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-4 py-3">
                    <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">{k}</dt>
                    <dd className="font-mono text-sm tabular-nums text-zinc-200">{v}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">Vault</dt>
                  <dd>
                    <VaultAddress className="font-mono text-sm tabular-nums text-zinc-200" />
                  </dd>
                </div>
              </dl>
            </aside>
          </div>
        </div>

        <div className="relative z-10">
          <div className="border-t border-white/8">
            <div className="mx-auto flex max-w-[1400px] flex-col items-start justify-between gap-3 px-4 py-5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 md:flex-row md:items-center md:px-8">
              <p>© 2026 Mosaic Capital. All rights reserved.</p>
              <p className="text-zinc-300">
                <span className="text-zinc-50">+</span> One deposit. Many sources of yield. <span className="text-zinc-50">+</span>
              </p>
              <div className="flex gap-4">
                <Link className="-my-2 py-2 text-zinc-300 underline-offset-4 hover:text-zinc-50 hover:underline" href="/privacy">Privacy</Link>
                <Link className="-my-2 py-2 text-zinc-300 underline-offset-4 hover:text-zinc-50 hover:underline" href="/terms">Terms</Link>
                <Link className="-my-2 py-2 text-zinc-300 underline-offset-4 hover:text-zinc-50 hover:underline" href="/docs">Docs</Link>
                <Link className="-my-2 py-2 text-zinc-300 underline-offset-4 hover:text-zinc-50 hover:underline" href="/whitepaper">Whitepaper</Link>
                <Link className="-my-2 py-2 text-zinc-300 underline-offset-4 hover:text-zinc-50 hover:underline" href="/blog">Blog</Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
