# Mosaic key visuals

Ten layout templates that use the site's own visual system: Geist Sans / Geist Mono, ink `#0a0a0a`,
accent `#2563eb`, 22px grids, the tile field, `[01]` section tags, numeral watermarks, corner brackets,
bumper buttons, sharp corners. Every PNG is rendered at 2× from the HTML in `source/`, so the HTML is
the editable template and the PNG is the export.

| File | Frame | Use | Motif |
| --- | --- | --- | --- |
| `KV-01-hero-thesis.png` | 1920×1080 · 16:9 | Site hero, X/Twitter header, deck cover | Tile field + grid, h1, bumper CTA, rule stats strip |
| `KV-02-allocation-tape.png` | 1080×1080 · 1:1 | Instagram / X post | Treemap of live weights on dot field |
| `KV-03-rules-not-vibes.png` | 1920×1080 · 16:9 | Dark hero, OG image | Black bar, corner-bracket panel, published numbers |
| `KV-04-numbered-card.png` | 1080×1350 · 4:5 | Carousel slide (one per step) | Numbered card with numeral watermark |
| `KV-05-share-rail.png` | 1920×1080 · 16:9 | Explainer, blog header | Rising price-per-share line, timeline axis |
| `KV-06-mosaic-field.png` | 1080×1080 · 1:1 | Brand poster, avatar backdrop | Full tile field, white logo plate |
| `KV-07-live-on-chain.png` | 1920×1080 · 16:9 | Launch announcement | Ledger panel, live pill, field fade-in |
| `KV-08-worked-example.png` | 1080×1920 · 9:16 | Story / Reel | Vertical ledger rail, big money figure |
| `KV-09-failure-modes.png` | 1920×1080 · 16:9 | Risk / transparency post | Three ruled columns, icons, numerals |
| `KV-10-brand-cover.png` | 1080×1080 · 1:1 | Profile / cover, dark | Dark field, logo plate, wordmark lockup |

`_overview.png` is a contact sheet of all ten.

## Editing and re-rendering

```
cd design/key-visuals/source
./render.sh          # all ten → ../KV-NN-*.png
./render.sh kv-03    # one
SCALE=1 ./render.sh  # 1× export
```

Rendering uses the Google Chrome on this Mac in headless mode; nothing to install. Each `kv-NN-*.html`
declares its frame as `--w` / `--h` on `.kv` and pulls tokens from `kv.css`; the tile field, price line and
icons come from `kv.js`. Change copy in the HTML, keep the tokens in `kv.css`.

## Numbers used

Real, published parameters only: max pool weight 40%, idle buffer 5%, rebalance threshold 0.5%,
cooldown 24h, performance fee 10% of yield, deposit cap $2,000,000, target split 40 / 35 / 25 across
Steakhouse USDG, Ethena × Steakhouse USDG and NetNet Credit, vault `0xFB20…5A6f` on Robinhood Chain (4663).
No APY figure appears anywhere: the site measures it from the chain and never advertises one, so the
templates do the same. The price line in KV-05 is a shape, not data.
