---
title: Twelve Decimals, and the Attack They Make Uneconomic
summary: mUSDG carries six more decimals than the USDG behind it. That is not a rounding preference. It is the cheapest defence there is against the oldest trick played on empty vaults.
date: 2026-09-04
---

USDG has six decimals. A share of Mosaic, mUSDG, has twelve. If you have looked at an ERC-4626 vault before, the usual pattern is for the share to copy the asset, so the mismatch looks like a mistake. It is the opposite. The six extra decimals are the first line of the security notes, and they cost nothing to run.

The trick they defend against is old enough to have a name, the inflation attack, and it works on any vault whose share price is total assets divided by total shares. Picture the vault in its first minute, holding nothing. An attacker deposits one unit and receives one share. Then they send a large amount of USDG straight to the vault's address, not through deposit, just a transfer. Total assets are now large, total shares are still one, and the price of that single share has been inflated to the size of the donation. The next honest depositor arrives, deposits less than the donation, and the vault rounds their share count down to zero. Their money has become part of the attacker's one share. It is not a bug in any one line. It is what division does when the denominator is tiny.

<figure>
<svg viewBox="0 0 640 312" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The same donation attack on a vault without a decimals offset and on Mosaic with a six-decimal offset. Without the offset the next depositor receives zero shares; with it the attacker captures about one USDG for a million spent.">
  <g font-size="10" letter-spacing="1.6" fill="#71717a">
    <text x="0" y="12">[A] SHARE = ASSET, NO OFFSET</text>
    <text x="340" y="12">[B] MOSAIC, SIX-DECIMAL OFFSET</text>
  </g>
  <g stroke="rgba(0,0,0,0.18)" fill="none">
    <path d="M0 26 h300 M340 26 h300"/>
  </g>
  <!-- A: assets -->
  <g>
    <text x="0" y="52" font-size="10" fill="#a1a1aa" letter-spacing="1.2">TOTAL ASSETS</text>
    <text x="0" y="78" font-size="22" fill="#0a0a0a" letter-spacing="-0.5">1,000,001</text>
    <text x="0" y="96" font-size="11" fill="#6b6b70">1 deposited by the attacker + 1,000,000 donated</text>
    <path d="M0 112 h300" stroke="rgba(0,0,0,0.08)"/>
    <text x="0" y="132" font-size="10" fill="#a1a1aa" letter-spacing="1.2">÷ TOTAL SHARES</text>
    <text x="0" y="158" font-size="22" fill="#0a0a0a" letter-spacing="-0.5">1</text>
    <path d="M0 174 h300" stroke="rgba(0,0,0,0.18)"/>
    <text x="0" y="196" font-size="10" fill="#a1a1aa" letter-spacing="1.2">= PRICE PER SHARE</text>
    <text x="0" y="218" font-size="14" fill="#0a0a0a">1,000,001 USDG</text>
    <text x="0" y="252" font-size="10" fill="#a1a1aa" letter-spacing="1.2">NEXT DEPOSIT OF 999,999 USDG</text>
    <text x="0" y="274" font-size="14" fill="#0a0a0a">0 shares</text>
    <text x="0" y="294" font-size="11" fill="#6b6b70">the attacker spends 1,000,000 and takes 999,999</text>
  </g>
  <!-- B: assets -->
  <g>
    <text x="340" y="52" font-size="10" fill="#a1a1aa" letter-spacing="1.2">TOTAL ASSETS</text>
    <text x="340" y="78" font-size="22" fill="#0a0a0a" letter-spacing="-0.5">1,000,001</text>
    <text x="340" y="96" font-size="11" fill="#6b6b70">the same 1 deposited + 1,000,000 donated</text>
    <path d="M340 112 h300" stroke="rgba(0,0,0,0.08)"/>
    <text x="340" y="132" font-size="10" fill="#a1a1aa" letter-spacing="1.2">÷ TOTAL SHARES</text>
    <text x="340" y="158" font-size="22" fill="#2563eb" letter-spacing="-0.5">1,000,000</text>
    <text x="474" y="158" font-size="11" fill="#6b6b70">per USDG deposited</text>
    <path d="M340 174 h300" stroke="rgba(0,0,0,0.18)"/>
    <text x="340" y="196" font-size="10" fill="#a1a1aa" letter-spacing="1.2">= PRICE PER SHARE</text>
    <text x="340" y="218" font-size="14" fill="#0a0a0a">1.000001 USDG</text>
    <text x="340" y="252" font-size="10" fill="#a1a1aa" letter-spacing="1.2">NEXT DEPOSIT OF 999,999 USDG</text>
    <text x="340" y="274" font-size="14" fill="#2563eb">999,998 shares</text>
    <text x="340" y="294" font-size="11" fill="#6b6b70">the attacker spends 1,000,000 and takes about 1</text>
  </g>
  <!-- corner brackets on B -->
  <g stroke="#2563eb" fill="none" stroke-width="1">
    <path d="M334 20 v-8 h8 M646 20 v-8 h-8 M334 302 v8 h8 M646 302 v8 h-8" transform="translate(-6,0)"/>
  </g>
</svg>
<figcaption><b>Fig. 01</b> · The same donation, before and after the offset. Only the denominator changes.</figcaption>
</figure>

Every defence is some version of making the denominator not tiny. Mosaic's version is the decimal offset. Each USDG of assets is worth a million shares from the first deposit, so the attacker's opening share is not one share but one million, and the donation needed to push an honest depositor's rounding to zero grows by the same factor. The arithmetic is simple and unkind to the attacker: to steal a given amount, the donation has to be about a million times larger than the amount at stake. Nobody gives away a million dollars to take one.

The same offset does a second, quieter job. Rounding in a vault is always in the vault's favour, which means every depositor loses a sliver on the way in and another on the way out. With twelve-decimal shares the sliver on a deposit-and-withdraw round trip is about a millionth of a USDG. It exists, it is bounded, and it is the same order of dust the underlying pools round off in their own favour when we redeem from them. We would rather tell you the size of a loss than say there is none.

There is a design lesson in this that we keep coming back to. The obvious defence against the inflation attack is a dead share: mint a few shares to nobody on the first deposit so the denominator is never one. It works, and it also means the vault permanently holds a small amount of someone's money that can never be withdrawn. The offset achieves the same protection without a permanent resident. Where two defences are equally strong, we take the one that leaves less behind.

Price per share starts at exactly one, scaled. After your first deposit at par, that number moving is the entire story of what your money is doing. Total assets are the idle buffer plus whatever every adapter reports it holds, principal and accrued interest, and total shares are what the wallets hold. Everything else in the vault, the scoring, the rebalancing, the fee, is built on top of that one division being hard to lie to.
