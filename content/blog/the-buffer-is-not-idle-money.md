---
title: The Buffer Is Not Idle Money
summary: Five percent of the vault sits in plain USDG, earning nothing. That is not waste. It is the price of a withdrawal that does not make you wait.
date: 2026-09-13
---

Look at the allocation tape on the Mosaic page and you will see a slice labelled buffer. Five percent of the vault, held as plain USDG, earning exactly nothing. If you are the kind of person who optimises, that slice will bother you. It is meant to.

Here is what the buffer buys. When you withdraw from a vault that has sent every dollar out to lending pools, the vault has to go and get your money back first. On a good day that is one extra transaction and a little gas. On a bad day, when a pool is heavily borrowed and its free liquidity is thin, it is a partial withdrawal, or a wait, or a withdrawal that only works if you split it into pieces. Lending pools are not banks. They can only give back what has not been lent out.

The buffer means that for the overwhelming majority of withdrawals, the vault already has your USDG in hand. It does not have to touch a pool at all. Withdrawals up to the buffer are instant and cost no more than a transfer. Withdrawals larger than that pull from the pools in order of what they can actually pay out, which the adapters report, and which the operations page shows you before you press anything.

There is a second job the buffer does, quieter than the first. Deposits also land in it. Rather than routing every deposit out to three venues the moment it arrives, which would cost gas three times over for every depositor, the vault lets the buffer grow past its target and then deploys the excess in one move when the keeper runs. Batching like this is how a vault can accept a three dollar deposit without spending more than three dollars sending it somewhere.

Could the buffer be smaller? Yes. Could it be zero? Also yes, and some vaults run that way. We chose five percent because the cost is small and measurable, roughly five percent of whatever the pools are paying, and the thing it buys is the ability to say withdrawals work without a footnote. When the vault is larger and the keeper has more history to work with, the target can be tuned. Until then, the dash on the page next to the buffer's rate is the most honest number on the site. It is earning nothing, on purpose, so that you can leave whenever you like.
