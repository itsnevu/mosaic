---
title: The Mark Only Moves Up
summary: Ten percent of yield sounds simple until you ask what happens in a drawdown, on a deposit, or on a gain too small to charge. The high-water mark is the answer to all three, and it has one job: never let the fee touch principal.
date: 2026-09-19
---

Mosaic charges ten percent of yield and nothing else. There is no deposit fee, no withdrawal fee, no fee on assets under management, and the ten percent is capped at thirty in the contract so it cannot quietly become something else later. That sentence is easy to write. The hard part is making "of yield" mean exactly that at every moment, for every depositor, and the mechanism that does it is the high-water mark.

The mark is the highest price per share the vault has ever recorded. A fee is only ever calculated on the distance between the current price per share and that mark. If the price is at or below the mark, the fee is zero, full stop. That covers the obvious case, a vault that has not earned, and the less obvious one, a drawdown. If a venue has a bad month and the share price dips, no fee is charged on the way back up until the previous peak is passed again. You do not pay twice for the same ground.

<figure>
<svg viewBox="0 0 640 214" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A price per share line rising, dipping, recovering and rising again, with the high-water mark drawn as a step line that only ever moves up. Shaded bands mark the only stretches where a fee is taken: when the price is above the mark and making a new high. During the dip and the recovery back to the old peak, no fee.">
  <g font-size="10" letter-spacing="1.6" fill="#71717a">
    <text x="0" y="12">PRICE PER SHARE VS HIGH-WATER MARK</text>
    <text x="640" y="12" text-anchor="end">FEE = 10% × (PPS − MARK)</text>
  </g>
  <path d="M0 26 h640" stroke="rgba(0,0,0,0.18)" fill="none"/>
  <!-- fee bands: only where a new high is being made -->
  <g fill="rgba(37,99,235,0.08)">
    <rect x="0" y="30" width="150" height="120"/>
    <rect x="400" y="30" width="100" height="120"/>
    <rect x="550" y="30" width="50" height="120"/>
  </g>
  <!-- no-fee band -->
  <g fill="rgba(0,0,0,0.03)">
    <rect x="150" y="30" width="250" height="120"/>
    <rect x="500" y="30" width="50" height="120"/>
  </g>
  <!-- grid -->
  <g stroke="rgba(0,0,0,0.08)" fill="none">
    <path d="M0 150 h600 M0 90 h600"/>
  </g>
  <!-- high-water mark step -->
  <path d="M0.0,150.0 H50.0 V132.9 H100.0 V111.4 H150.0 V94.3 H400.0 V94.3 H450.0 V77.1 H500.0 V55.7 H550.0 V55.7 H600.0 V42.9" fill="none" stroke="#0a0a0a" stroke-width="1" stroke-dasharray="2 3"/>
  <!-- price per share -->
  <polyline points="0.0,150.0 50.0,132.9 100.0,111.4 150.0,94.3 200.0,107.1 250.0,124.3 300.0,115.7 350.0,98.6 400.0,94.3 450.0,77.1 500.0,55.7 550.0,64.3 600.0,42.9" fill="none" stroke="#2563eb" stroke-width="1.75" stroke-linejoin="round"/>
  <!-- markers -->
  <g fill="#ffffff" stroke="#2563eb" stroke-width="1.5">
    <circle cx="150" cy="94.3" r="3"/>
    <circle cx="400" cy="94.3" r="3"/>
    <circle cx="600" cy="42.9" r="3"/>
  </g>
  <!-- labels -->
  <g font-size="10" fill="#6b6b70">
    <text x="4" y="46">fee taken</text>
    <text x="156" y="46">no fee: below the mark</text>
    <text x="404" y="46" fill="#2563eb">fee taken again</text>
    <text x="504" y="46">no fee</text>
    <text x="554" y="46" fill="#2563eb">fee</text>
  </g>
  <g font-size="9" fill="#a1a1aa" letter-spacing="1">
    <text x="156" y="88">PEAK · THE MARK PARKS HERE</text>
    <text x="330" y="146">RECOVERY, NOT YIELD</text>
    <text x="404" y="110">PEAK PASSED</text>
  </g>
  <!-- legend / axes -->
  <g font-size="9" fill="#a1a1aa" letter-spacing="1">
    <text x="608" y="46">PPS</text>
    <text x="608" y="154">1.00</text>
  </g>
  <g font-size="10" fill="#6b6b70">
    <path d="M0 176 h18" stroke="#2563eb" stroke-width="1.75"/>
    <text x="24" y="180">price per share</text>
    <path d="M140 176 h18" stroke="#0a0a0a" stroke-width="1" stroke-dasharray="2 3"/>
    <text x="164" y="180">high-water mark, only ever moves up</text>
    <rect x="392" y="170" width="12" height="9" fill="rgba(37,99,235,0.08)"/>
    <text x="410" y="180">fee applies</text>
  </g>
  <path d="M0 198 h640" stroke="rgba(0,0,0,0.08)"/>
  <text x="0" y="211" font-size="10" fill="#6b6b70">Illustrative path. The real line is read from the vault, and the page says so.</text>
</svg>
<figcaption><b>Fig. 04</b> · Between the first peak and the day it is passed again, the fee is exactly zero.</figcaption>
</figure>

The second thing the mark protects is depositors from each other. The fee is accrued before every deposit, mint, withdraw and redeem, not on a schedule. So when you deposit, whatever gain the vault had made up to that block is settled first, at the old share count, and your shares are minted at a price that already has the fee taken out of it. You never pay for a gain that happened before you arrived. Symmetrically, when you leave, the fee on the gain you were present for is settled before your shares are priced, so nobody who stays pays for what you took with you.

The third thing is the form the fee takes. It is not withdrawn as USDG. It is minted as mUSDG shares to the fee recipient, sized so that the recipient's claim equals the fee. That dilutes the price per share by exactly the fee and removes no assets from the vault, which means the total assets figure you can read on-chain is never reduced by us taking our cut. The mark is then reset to the diluted price, so the next fee starts from where the last one ended. Nobody at Mosaic is paid for your money sitting still, and nobody at Mosaic is paid out of the money itself.

There is one edge case worth naming, because we got it wrong once and wrote about it. A gain can be so small that ten percent of it rounds to zero shares. The lazy implementation skips the fee and leaves the mark where it was. The next time the price rises enough to mint a whole share, the old gain is still sitting below the mark and gets charged along with the new one. That is a fee on principal wearing a disguise. Mosaic's code moves the mark up even when it mints nothing, so a gain that was declined once is never counted again. It is one line. We would rather you knew it was there.

None of this makes the fee small, and it is not meant to. Ten percent of what the vault earns is what we charge for deciding where the money goes and reporting every move. What the mark guarantees is narrower and, we think, more important than the rate: the fee can only ever be a fraction of a gain you actually received, measured from a peak you actually passed. If the number did not go up, we did not get paid.
