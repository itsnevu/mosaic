---
title: Depositing and withdrawing
summary: What to expect as a depositor — the two transactions, what the dashboard shows, and when a withdrawal can fail.
order: 3
---

## Depositing

Depositing takes two transactions the first time and one after that.

1. **Approve** — allow the vault to move the USDG you are depositing. Wallets show this as a
   token approval. The app requests exactly the amount you entered, not an unlimited allowance.
2. **Deposit** — the vault takes the USDG and mints `mUSDG` to you at the current share price.

Your deposit sits in the idle buffer until the next batch is deployed. It is earning from the
moment the batch lands, not from the moment you deposit — batching is what keeps entry gas cheap,
and the wait is usually short.

### What you receive

`mUSDG` is a standard ERC-4626 share token with twelve decimals — the asset's six plus a
six-decimal offset that keeps rounding loss at roughly one wei and makes the classic share-price
inflation attack uneconomic.

Your share count never changes on its own. Yield arrives as each share becoming worth more USDG.

## Withdrawing

One transaction: redeem shares, receive USDG at the current price.

Withdrawals come out of the idle buffer first. If the buffer is short, the vault unwinds venue
positions in registry order until the amount is covered.

### Withdrawals are all-or-nothing

There are no partial fills. If the vault cannot cover the full amount, the transaction reverts and
your shares are untouched — you are never left holding a half-executed exit.

So that this is predictable rather than surprising, the app shows what the vault can actually pay
before you type an amount. That figure counts the buffer plus, per venue, only the cash it could
hand over right now. **Balances lent out to borrowers are excluded**, because they are not available
until a borrower repays.

If your amount exceeds that figure, the button tells you so instead of letting you send a
transaction that will fail.

Type an amount and the panel also shows the route the redemption would take, computed the way
the contract walks it: how much comes from the buffer, how much unwinds from which venue, in
registry order, and whether the whole amount clears. You see the path before the wallet asks for a
signature.

### When capacity is tight

Lending venues can be temporarily illiquid — that is a normal state for a lending market, not a
failure. Options when it happens:

- Withdraw up to the available capacity now, and the rest later.
- Wait. Borrowers repay, and the keeper's next deployment or rebalance restores the buffer.

The vault never guarantees instant exit of the full balance under all conditions, and any product
claiming otherwise while supplying to lending markets is describing something it cannot control.

## What the dashboard shows

| Panel | What it tells you |
| --- | --- |
| **TVL, share price, pools** | the vault's size and the price your shares are worth |
| **Share price since launch** | one line drawn from every fee accrual, deposit and redemption on-chain, starting at exactly 1.0000; no sampling and no projection |
| **Allocation** | which venue holds which portion, current weight against target, and the rate each pays |
| **Operations** | what could be withdrawn right now, the share of TVL that is liquid, current drift, and whether a rebalance is worth doing |
| **Your position** | your USDG, your shares, what they are worth, what you deposited and withdrew, and what the position has earned — read from your own `Deposit` and `Withdraw` events |
| **History** | every deployment, rebalance, fee accrual and target change, read straight from chain logs |

Everything on that page is read from the chain in the browser, through a same-origin relay that
forwards read calls and stores nothing. Nothing shown is a stand-in — when a number cannot be read, it shows a dash rather than a plausible
substitute.

## Fees, in practice

Ten percent of yield. Nothing on principal, ever.

The fee is tracked against a high-water mark on share price, so:

- A period where the vault does not earn costs you nothing.
- After a drawdown, no fee is charged again until the previous peak is passed.
- You are never charged for a gain that happened before you deposited — fees accrue before every
  deposit, so you buy in at a price that already reflects them.

The fee is taken as newly minted shares to the fee recipient, not as USDG leaving the vault.

## Common questions

**Do I need to claim anything?** No. There is no claim button anywhere in Mosaic, by design. Yield
is the share price rising.

**Will I see a reward token?** No. `mUSDG` is the only token involved.

**What if I do nothing for a year?** That is the intended use. The keeper deploys, rebalances and
samples rates on its own; your shares simply become worth more.

**Can the team take my funds?** The owner can pause deposits, adjust parameters within coded bounds,
and pull capital from a venue back to the buffer. Withdrawals stay open while paused. The owner
cannot transfer depositor assets out of the vault. See [Security](/docs/security) for the full
trust model.
