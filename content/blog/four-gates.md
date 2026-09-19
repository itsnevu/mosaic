---
title: Four Gates, and Most Days All Four Say Hold
summary: A rebalance is the most expensive thing the vault can do and the easiest to do badly. So it has to pass four checks in order, and failing any one of them means the vault does nothing, on purpose.
date: 2026-09-16
---

The tempting design for a yield aggregator is to move money whenever a better rate appears. It feels responsive. It is also how sophisticated strategies underperform lazy ones, because every move costs gas on both legs, every unwind risks landing short, and a rate that looked better this block is often one borrower repaying next block. Overtrading is a real cost that never shows up on the dashboard that caused it.

Mosaic's rebalance is therefore built to refuse. Before it moves a single USDG it has to clear four gates, in a fixed order, and if any gate fails the transaction reverts and the book stays exactly where it was. You can watch this happen. The function that tells you whether a rebalance would go, and the numbers behind that answer, is a free read called previewRebalance, and the dashboard and the keeper both read it.

<figure>
<svg viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four gates in order: cooldown of 24 hours elapsed, drift above 0.5 percent, net gain over 30 days minus gas at or above minus 0.5 percent of the assets moved, and every unwind landing within 0.1 percent of what was asked. Failing any gate leads to hold; passing all four leads to move.">
  <g font-size="10" letter-spacing="1.6" fill="#71717a">
    <text x="0" y="12">REBALANCE()</text>
    <text x="640" y="12" text-anchor="end">IN THIS ORDER</text>
  </g>
  <path d="M0 26 h640" stroke="rgba(0,0,0,0.18)" fill="none"/>
  <!-- gates -->
  <g fill="none" stroke="#0a0a0a" stroke-width="1">
    <rect x="0" y="56" width="136" height="88"/>
    <rect x="168" y="56" width="136" height="88"/>
    <rect x="336" y="56" width="136" height="88"/>
    <rect x="504" y="56" width="136" height="88"/>
  </g>
  <g font-size="9" fill="#a1a1aa" letter-spacing="1.2">
    <text x="10" y="72">GATE 1 · TIME</text>
    <text x="178" y="72">GATE 2 · DRIFT</text>
    <text x="346" y="72">GATE 3 · ECONOMICS</text>
    <text x="514" y="72">GATE 4 · EXECUTION</text>
  </g>
  <g font-size="18" fill="#0a0a0a" letter-spacing="-0.4">
    <text x="10" y="98">24h</text>
    <text x="178" y="98">&gt; 0.5%</text>
    <text x="346" y="98">≥ −0.5%</text>
    <text x="514" y="98">≤ 0.1%</text>
  </g>
  <g font-size="10" fill="#6b6b70">
    <text x="10" y="116">since the last</text>
    <text x="10" y="130">successful rebalance</text>
    <text x="178" y="116">largest gap between</text>
    <text x="178" y="130">a weight and target</text>
    <text x="346" y="116">30-day gain minus gas,</text>
    <text x="346" y="130">over assets moved</text>
    <text x="514" y="116">shortfall on every</text>
    <text x="514" y="130">unwind, and overall</text>
  </g>
  <!-- pass arrows -->
  <g stroke="#2563eb" fill="none" stroke-width="1.25">
    <path d="M136 100 h32 M162 96 l6 4 l-6 4"/>
    <path d="M304 100 h32 M330 96 l6 4 l-6 4"/>
    <path d="M472 100 h32 M498 96 l6 4 l-6 4"/>
    <path d="M572 144 v72 M568 210 l4 6 l4 -6"/>
  </g>
  <!-- fail arrows -->
  <g stroke="rgba(0,0,0,0.35)" fill="none" stroke-width="1" stroke-dasharray="3 3">
    <path d="M68 144 v72 M236 144 v72 M404 144 v72"/>
  </g>
  <g stroke="rgba(0,0,0,0.35)" fill="none" stroke-width="1">
    <path d="M64 210 l4 6 l4 -6 M232 210 l4 6 l4 -6 M400 210 l4 6 l4 -6"/>
  </g>
  <!-- outcomes -->
  <rect x="0" y="222" width="472" height="40" fill="none" stroke="rgba(0,0,0,0.18)"/>
  <text x="16" y="246" font-size="12" fill="#0a0a0a">HOLD</text>
  <text x="66" y="246" font-size="10" fill="#6b6b70">the transaction reverts and the book stays where it was</text>
  <rect x="504" y="222" width="136" height="40" fill="#2563eb"/>
  <text x="520" y="246" font-size="12" fill="#ffffff">MOVE</text>
  <text x="562" y="246" font-size="10" fill="rgba(255,255,255,0.75)">24h resets</text>
  <g font-size="9" fill="#a1a1aa" letter-spacing="1">
    <text x="76" y="162">FAIL</text>
    <text x="244" y="162">FAIL</text>
    <text x="412" y="162">FAIL</text>
    <text x="580" y="162" fill="#2563eb">PASS</text>
  </g>
  <text x="0" y="292" font-size="10" fill="#6b6b70">Gate 4 is checked while moving: a short unwind or a leaked round trip reverts the whole transaction.</text>
</svg>
<figcaption><b>Fig. 03</b> · previewRebalance() answers the first three for free. The fourth can only be answered by trying.</figcaption>
</figure>

The first gate is time. Twenty-four hours have to pass since the last successful rebalance. Not since the last attempt, since the last one that went through. A rate that spikes for an hour cannot pull the book after it, because by the time the cooldown clears the spike has usually gone.

The second gate is drift. The contract compares every venue's current share of the book with its target and takes the largest gap. If that gap is half a percent or less, there is nothing worth correcting and the call reverts. Half a percent is small enough that the book tracks its targets, and large enough that ordinary interest accrual, which nudges the weights a hair every block, never triggers a move on its own.

The third gate is economics, and it is the one we spent the longest on. The contract plans the move first: pulls from over-weight venues, each capped at what that venue can actually pay out today, and pushes to under-weight ones, bounded by what the pulls can fund. Then it prices the plan over a thirty-day horizon, each push earning its destination's measured rate, each pull giving up its source's, and subtracts the gas cost the keeper has quoted in USDG. The result has to clear a floor of minus half a percent of the assets being moved. The floor is negative on purpose. Restoring target weights is a risk decision, not only a yield decision, so the vault is allowed to pay a little to get back to where it should be. It is not allowed to pay a lot, and at zero every rebalance would have to pay for itself.

The fourth gate is execution, and unlike the first three it cannot be answered in advance. Each unwind has to return within a tenth of a percent of what was asked, or the transaction reverts. Total assets before and after are compared against the same bound, so the round trip as a whole cannot leak more than that either. Pushes are limited by what was actually pulled and by each destination's cap and room; anything that cannot be placed stays in the buffer rather than being forced somewhere it does not fit.

The honest footnote is that the preview and the real thing can disagree by a hair. The preview reads the stored smoothed rates. The real rebalance samples fresh ones first and plans on those. Right at the threshold, one can say go while the other says hold. The keeper simulates before it sends, so the cost of that disagreement is a skipped tick, not a reverted transaction you paid for.

Most days, all four gates will say hold, and the vault will do nothing. That is the design working, not failing. Doing nothing is a decision the contract is allowed to make, and every time it makes one, the reason is a number you can read.
