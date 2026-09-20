# Mosaic Capital — USDG yield aggregator

> One deposit, many sources of yield.

Deposit **USDG** once; the ERC-4626 vault spreads it across lending-pool adapters
(Turret among them), keeps an idle buffer for cheap withdrawals, rebalances only when
drift clears a threshold and a cooldown, and charges a performance fee on yield only.
Yield arrives as the price per share rising — there is no claim button.

Spec: [`content/whitepaper.md`](content/whitepaper.md) — the protocol as implemented, served at
`/whitepaper`. Product notes in `docs/PRODUCT.md`, security notes in `docs/SECURITY.md`.

## Layout

```
contracts/              Foundry project (Solidity ^0.8.24, OpenZeppelin 5)
  src/MosaicVault.sol          ERC-4626 vault: adapter registry, buffer, deploy/rebalance, HWM fee
  src/interfaces/IPoolAdapter.sol   deposit / withdraw / totalAssets / currentRateBps / asset
                                    + availableLiquidity / maxDeposit / utilizationBps
  src/mocks/MockUSDG.sol       6-decimal mintable ERC20 (dev only)
  src/mocks/MockLendingPool.sol  interest-accruing pool with utilization + illiquidity simulation
  src/mocks/MockPoolAdapter.sol  adapter over MockLendingPool, vault-only
  script/Deploy.s.sol          local deploy; writes deployments/local.json
  script/DeployProduction.s.sol  real USDG + supplied adapters; hands ownership to a multisig
  test/MosaicVault.t.sol       55 tests incl. fuzz
  test/Scoring.t.sol           cap-and-redistribute stress: 5 adapters, random rates and caps
  deployments/local.json       addresses the frontend reads (generated)
scripts/sync-abi.mjs    copies ABIs from contracts/out -> src/lib/abi/*.ts
scripts/keeper.mjs      polls, prices gas into USDG, deploys and rebalances when the vault agrees
src/lib/chain.ts        Anvil chain + production chain read from NEXT_PUBLIC_* (see .env.example)
src/lib/contracts.ts    DEPLOYMENTS by chain id, ABIs, decimals constants
src/lib/hooks.ts        useVaultStats, useUserPosition, useAllocations, useVaultOps
src/lib/events.ts       useVaultActivity, useDepositorCount, useUserLedger (what a position earned),
                        useSharePriceHistory — all straight from chain logs
src/lib/logs.ts         adaptive log scanner: whole range first, narrower only if the provider refuses,
                        cached per query in the browser, reports whether it reached the launch block
src/lib/wagmi.ts        wagmi config (injected connector)
src/components/Providers.tsx, ConnectButton.tsx, Dashboard.tsx
src/components/SharePriceChart.tsx  share price since launch, drawn only from on-chain events
src/components/NetworkGuard.tsx  wrong-network banner + switch-chain button
src/components/Operations.tsx    liquidity/rebalance panel + activity feed
src/app/app/page.tsx    vault dashboard (/app)
src/lib/content.ts      markdown pages: frontmatter, rendering, table of contents
src/components/ContentShell.tsx  header/footer/TOC shared by docs, blog and whitepaper
src/app/docs, /blog, /whitepaper, /changelog  statically generated from content/*.md
src/app/api/rpc/route.ts  same-origin read relay: allowlisted methods, shared answers, closed history kept an hour
content/whitepaper.md   the protocol whitepaper (served at /whitepaper)
content/docs/*.md       documentation pages (served at /docs/<slug>)
content/blog/*.md       blog posts (served at /blog/<slug>)
content/changelog.md    what changed, when, and where to check it (served at /changelog)
docs/SECURITY.md        trust model, invariants, known gaps, deployment checklist
                        — also rendered as /docs/security, so the two never drift
```

## Local run

Requires Node 20+, [Foundry](https://getfoundry.sh) (`forge`, `anvil`, `cast` on PATH),
and a browser wallet pointed at `http://127.0.0.1:8545` (chain id 31337).

```bash
npm install
cd contracts && forge install OpenZeppelin/openzeppelin-contracts --no-git && cd ..   # first time only

# terminal 1 — local chain
npm run chain

# terminal 2 — deploy mocks + vault, sync ABIs, start the app
npm run deploy:local      # forge script -> contracts/deployments/local.json
npm run abi:sync          # contracts/out -> src/lib/abi
npm run dev               # http://localhost:3000  (dashboard at /app)
```

`deploy:local` uses Anvil's default account #0 key. It deploys MockUSDG, three pools
(Turret 9%, Pool B 7%, Pool C 5% APY), three adapters and the vault with target weights
40 / 35 / 25, and mints 1,000,000 USDG to account #0 and account #1
(`0x7099…79C8`, key `0x59c6…690d`). Import either key into your wallet to test.

Run the keeper against it (simulates every call before sending):

```bash
npm run keeper:local              # add DRY_RUN=1 to send nothing, ONCE=1 for a single tick
SCORING=1 npm run keeper:local    # also push scored target weights, when the owner enabled scoring
```

Keeper actions from the CLI (account #0 is owner + keeper):

```bash
VAULT=$(node -p "require('./contracts/deployments/local.json').vault")
cast send $VAULT 'deploy()'    --private-key 0xac09...ff80 --rpc-url http://127.0.0.1:8545
cast send $VAULT 'rebalance()' --private-key 0xac09...ff80 --rpc-url http://127.0.0.1:8545
cast rpc evm_increaseTime 31536000 --rpc-url http://127.0.0.1:8545   # fast-forward a year
```

### Contracts only

```bash
npm run contracts:build
npm run contracts:test     # forge test -vvv
```

### Going to production

Nothing is hard-coded — the chain and the addresses come from the environment.

1. `cp .env.example .env.local` and fill in the chain (`NEXT_PUBLIC_CHAIN_ID`,
   `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_EXPLORER_URL`) and the deploy variables.
   `NEXT_PUBLIC_*` values are inlined at build time, so set them before `npm run build`.
2. Write an `IPoolAdapter` implementation per venue (`MockPoolAdapter` is the reference —
   seven functions) and deploy it.
3. `USDG_ADDRESS=… VAULT_OWNER=<multisig> FEE_RECIPIENT=… ADAPTERS=0x…,0x… WEIGHTS_BPS=6000,4000 \
   RPC_URL=… PRIVATE_KEY=… npm run deploy:production`. The deployer configures the vault, then
   hands ownership to `VAULT_OWNER`; addresses land in `contracts/deployments/production.json`.
4. Set `NEXT_PUBLIC_VAULT_ADDRESS` / `NEXT_PUBLIC_USDG_ADDRESS` / `NEXT_PUBLIC_POOLS` from that
   file, `npm run build`, and run the keeper with `NATIVE_USD` set so its gas quotes are real.
5. Work through the checklist at the bottom of `docs/SECURITY.md` before opening deposits.

## Vault parameters (defaults, owner-settable)

| Parameter | Default |
| --- | --- |
| Max weight per adapter | 40% |
| Idle buffer target | 6% |
| Rebalance threshold | 0.5% |
| Rebalance cooldown | 24h |
| Performance fee | 10% of yield (high-water mark on price per share) |
| Deposit cap | 2,000,000 USDG |
| Slippage bound (per unwind and per round trip) | 0.1% |
| Rebalance yield horizon | 30 days |
| Max yield drag per rebalance | 0.5% of the assets moved |
| Assumed rebalance gas cost | 0 (keeper-quoted, capped by `maxRebalanceCostAssets`) |
| On-chain weight scoring | off (`setScoringEnabled`) |

Shares (`mUSDG`) have 12 decimals (6 asset decimals + 6 ERC-4626 offset).
