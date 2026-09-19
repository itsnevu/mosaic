---
title: Its Freedom Is When, Never Where
summary: A hot key runs the keeper, and hot keys get stolen. So the contract gives the keeper exactly one kind of authority, timing, and takes away every other kind before the key is ever cut.
date: 2026-09-08
---

Every automated vault has a keeper, the script that wakes up, looks at the chain, and decides whether to do something. Every keeper has a key, and because the script has to run unattended on a server that is connected to the internet, that key is a hot key. This is not a Mosaic problem. It is the shape of the job. The question is what a stolen key can do, and our answer is that it can decide when the vault acts and nothing about where the money goes.

The contract enforces this by giving the keeper a short list of verbs. It can sample rates. It can deploy whatever USDG is sitting above the buffer target into the venues. It can call rebalance. It can quote the gas cost that the rebalance economics use. Once the owner has switched scoring on, it can ask the contract to turn the on-chain score into target weights. That is the whole list, and every item on it is a matter of timing, not direction.

<figure>
<svg viewBox="0 0 640 336" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The keeper's authority: it may call pokeRates, deploy, rebalance, setRebalanceCostAssets and applyScoredWeights, and its funds can only move between the idle buffer and registered adapters. It cannot send funds elsewhere, exceed a weight ceiling, skip the drift threshold or the cooldown, hold assets, or block withdrawals.">
  <g font-size="10" letter-spacing="1.6" fill="#71717a">
    <text x="0" y="12">[A] THE KEEPER MAY</text>
    <text x="340" y="12">[B] THE KEEPER CANNOT</text>
  </g>
  <path d="M0 26 h300 M340 26 h300" stroke="rgba(0,0,0,0.18)" fill="none"/>
  <!-- A list -->
  <g font-size="12" fill="#0a0a0a">
    <text x="0" y="52">pokeRates()</text>
    <text x="0" y="86">deploy()</text>
    <text x="0" y="120">rebalance()</text>
    <text x="0" y="154">setRebalanceCostAssets()</text>
    <text x="0" y="188">applyScoredWeights()</text>
  </g>
  <g font-size="10" fill="#6b6b70">
    <text x="0" y="66">sample every venue's rate</text>
    <text x="0" y="100">push idle above the buffer target into venues</text>
    <text x="0" y="134">only when all four gates clear</text>
    <text x="0" y="168">never above the owner's ceiling</text>
    <text x="0" y="202">only after the owner enables scoring</text>
  </g>
  <!-- A: money path -->
  <path d="M0 222 h300" stroke="rgba(0,0,0,0.08)"/>
  <text x="0" y="244" font-size="10" fill="#a1a1aa" letter-spacing="1.2">WHERE MONEY CAN MOVE</text>
  <g fill="none" stroke="#0a0a0a" stroke-width="1">
    <rect x="0" y="260" width="96" height="30"/>
    <rect x="204" y="260" width="96" height="30"/>
  </g>
  <g font-size="11" fill="#0a0a0a" text-anchor="middle">
    <text x="48" y="279">idle buffer</text>
    <text x="252" y="279">registered</text>
  </g>
  <text x="252" y="306" font-size="10" fill="#6b6b70" text-anchor="middle">adapters only</text>
  <g stroke="#2563eb" fill="none" stroke-width="1.25">
    <path d="M104 270 h92"/>
    <path d="M196 270 l-6 -4 M196 270 l-6 4"/>
    <path d="M196 280 h-92"/>
    <path d="M104 280 l6 -4 M104 280 l6 4"/>
  </g>
  <text x="150" y="264" font-size="9" fill="#2563eb" text-anchor="middle" letter-spacing="1">DEPLOY</text>
  <text x="150" y="296" font-size="9" fill="#2563eb" text-anchor="middle" letter-spacing="1">UNWIND</text>
  <!-- B list -->
  <g font-size="12" fill="#0a0a0a">
    <text x="340" y="52">send funds anywhere else</text>
    <text x="340" y="80">write a weight above its ceiling</text>
    <text x="340" y="108">skip the 0.5% drift threshold</text>
    <text x="340" y="136">skip the 24h cooldown</text>
    <text x="340" y="164">quote gas above the owner's cap</text>
    <text x="340" y="192">hold vault assets</text>
    <text x="340" y="220">block a withdrawal</text>
    <text x="340" y="248">register or remove an adapter</text>
    <text x="340" y="276">change the fee</text>
    <text x="340" y="304">pause</text>
  </g>
  <g stroke="rgba(0,0,0,0.18)" fill="none">
    <path d="M340 60 h300 M340 88 h300 M340 116 h300 M340 144 h300 M340 172 h300 M340 200 h300 M340 228 h300 M340 256 h300 M340 284 h300"/>
  </g>
  <g font-size="10" fill="#a1a1aa" text-anchor="end">
    <text x="640" y="52">no such function</text>
    <text x="640" y="80">contract check</text>
    <text x="640" y="108">contract check</text>
    <text x="640" y="136">contract check</text>
    <text x="640" y="164">contract check</text>
    <text x="640" y="192">by construction</text>
    <text x="640" y="220">by construction</text>
    <text x="640" y="248">owner only</text>
    <text x="640" y="276">owner only</text>
    <text x="640" y="304">owner only</text>
  </g>
  <path d="M0 330 h640" stroke="rgba(0,0,0,0.08)"/>
</svg>
<figcaption><b>Fig. 02</b> · Five verbs, one corridor. Everything in column B is refused by code, not by policy.</figcaption>
</figure>

Now walk through the theft. Someone has the keeper's key and wants the vault's USDG. They cannot send it to themselves, because no function on the vault takes a destination address from the keeper. The only places money can go are the idle buffer and the adapters the owner has registered, and the keeper cannot register one. They cannot pile everything into one venue and drain it from the other side, because every target weight the contract writes is checked against that venue's ceiling, forty percent by default. They cannot churn the book to bleed it through slippage, because the drift threshold and the twenty-four hour cooldown are checked inside rebalance itself, and each unwind must land within a tenth of a percent of what was asked or the whole transaction reverts. They cannot price rebalancing out of existence with a fake gas quote once the owner has set a ceiling on the quote. And they cannot touch a withdrawal, because withdrawals never pass through the keeper at all. Your exit is a call you make, paid from the buffer first and then from the venues in order, and the keeper is not in the path.

What a stolen key can do is stall. It can stop calling deploy, so new deposits sit idle a while longer. It can stop calling rebalance, so the book drifts from its targets. Both degrade yield. Neither loses funds. That is the bound we designed for: a compromised keeper is an annoyance with a ceiling on it, not a catastrophe.

The script itself is written to be replaceable. It simulates every call before sending it and logs a skip when the contract would refuse, so most of its ticks cost nothing. It fails over between RPC endpoints, times out a wedged tick rather than the whole process, and can run in a dry-run mode that needs no key at all, which is how we exercise the loop against a real chain for free. Two instances can run at once; whichever loses the race normally sees the vault reject its call at simulation and sends nothing, and a small random delay before each tick keeps them from colliding.

The parts that are not bounded by the keeper's key are bounded by the owner's, and that is a different conversation with a different answer. The owner can register adapters, set every parameter, pause, and pull any one venue back to the buffer. An owner that registers a hostile adapter and points the weights at it can lose the book. No line of code prevents that, which is why the owner is meant to be a multisig, several named people who each have to sign. A keeper is one key doing a narrow job on a schedule. An owner is several keys doing a wide job rarely. We think that is the right way round.
