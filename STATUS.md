# Mosaic Capital — Catatan Status (10 Sep 2026)

## Sudah selesai ✅
**Landing page** — replika accrued.trade dengan Tailwind class asli, **dibalik**: bg putih, komponen hitam, biru `#2563eb` hanya untuk angka uang.
- `src/app/page.tsx`, `src/components/{Header,NoticeBar,LiveMath,AllocationTape,Faq,Logo,icons}.tsx`
- Section: [01] hero + live-math (slider & chip interaktif) · [02] allocation tape · strip wallet · [04] How it earns (6 kartu watermark) · worked example · [05] Allocation engine · [06] The vault · [07] Published numbers · [08] Risk · [09] FAQ · footer
- Tombol Connect sungguhan (`ConnectButton.tsx`) dan stat hero live lewat `HeroStats.tsx`.

**Smart contract** (`contracts/`, Foundry) — **63 test lolos** (3 suite: 56 unit/fuzz + 7 invariant @128.000 call masing-masing)
- `MosaicVault.sol`: ERC-4626 atas USDG (share 12 dec, offset anti-inflation), registry adapter, target weight (cap 40%/pool), idle buffer 6%, `deploy()` batch pro-rata, `rebalance()` threshold 0.5% + cooldown 24h, performance fee 10% **hanya atas yield** (high-water mark), deposit cap 2jt, pause (withdraw tetap boleh), emergency withdraw
- **Rebalance ekonomis**: `_plan()` menghitung dulu apa yang akan dipindah dan berapa perubahan yield-nya selama `rebalanceHorizon` (30 hari), lalu menolak kalau tidak menutup `rebalanceCostAssets` (gas yang di-quote keeper) di luar jatah `maxRebalanceDragBps` (0,5% dari nilai yang dipindah). `previewRebalance()` membuka semua angka itu ke keeper & UI.
- **Min-output guard**: rencana tidak pernah meminta lebih dari kas bebas venue; tiap unwind wajib mendarat dalam `maxSlippageBps` (0,1%), dan `totalAssets` sebelum/sesudah dicek dengan batas yang sama.
- **Scoring alokasi on-chain**: `scoreAdapter()` = rate × likuiditas × (1 − utilisasi/2) × (1 − volatilitas), volatilitas dari EMA + mean-absolute-deviation yang disampel `pokeRates()`. `computeTargetWeights()` menormalkan ke 10.000 dengan cap per adapter, `applyScoredWeights()` dipakai keeper (harus di-`setScoringEnabled` owner dulu).
- **Likuiditas nyata**: `withdrawalCapacity()`, `liquidityByAdapter()`, dan override `maxWithdraw`/`maxRedeem` menanyakan kas bebas tiap venue lewat `IPoolAdapter.availableLiquidity()`.
- **Hardening**: rate adapter di-clamp 1000% APY sebelum masuk EMA/planning, adapter ber-cap 0 tidak bisa dapat bobot, dan quote gas keeper dibatasi `maxRebalanceCostAssets`.
- **Invariant suite** (`test/Invariants.t.sol`) — 3 depositor, keeper, rate berubah, borrower menguras pool, waktu berjalan: ledger selalu cocok, high-water mark tidak pernah turun, kapasitas tidak pernah melebihi aset, share selalu ter-backing, aset hanya keluar lewat withdraw (sisanya dust rounding venue ≤0,01 USDG per run), principal tidak pernah underwater.
- **Dua bug scoring ditemukan fuzz `test/Scoring.t.sol`** (5 adapter, rate & cap acak) lalu diperbaiki: dust pembulatan sempat bisa jatuh ke adapter berskor nol, dan pembagian bertingkat membuat skor pool ber-rate rendah membulat jadi nol. Detail di `docs/SECURITY.md`.
- `IPoolAdapter` + mock: `MockUSDG`, `MockLendingPool` (bunga per detik, bisa disimulasikan ilikuid), `MockPoolAdapter`

**Keeper** (`scripts/keeper.mjs`) — simulasi dulu, kirim kemudian
- Tiap tick: sampel rate kalau basi → (opsional) `applyScoredWeights()` → `deploy()` → hitung gas jadi USDG dan tulis ke `setRebalanceCostAssets()` → `previewRebalance()` → `rebalance()` kalau GO
- `DRY_RUN=1`, `ONCE=1`, `SCORING=1`, interval & harga native lewat env (lihat `.env.example`)
- Terbukti di Anvil: deploy 400k → scoring 40/35/25 → drift 15% → rebalance jalan dengan net +$229,94 vs floor −$352,61

**Keeper tahan mati** — gagal-alih RPC, timeout per tick, alert dengan dedupe, `/health` + heartbeat, aman multi-instance. Diuji: dengan endpoint mati di urutan pertama, satu tick tetap selesai ~1 detik.

**Frontend app** — wagmi + viem
- `/app` dashboard: TVL, share price, alokasi current vs target per pool, form deposit (approve→deposit) & withdraw
- **[03] Operations**: kapasitas withdraw sekarang, porsi TVL yang likuid, drift, nilai yang akan dipindah, ekspektasi yield net gas vs batas terburuk, status keeper
- **[07] History**: riwayat `Deployed` / `Rebalanced` / `FeeAccrued` / `TargetWeightsSet` / `ScoredWeightsApplied` langsung dari log chain (`src/lib/events.ts`), tanpa indexer
- Ganti jaringan: `NetworkGuard.tsx` menawarkan tombol switch, bukan cuma pesan; form withdraw memberi tahu kalau jumlahnya di atas likuiditas yang tersedia
- **Diverifikasi di browser sungguhan** (headless Chrome): `/`, `/app`, `/docs`, `/privacy`, `/terms` render dengan data chain live, nol console error
- **Semua angka karangan dihapus dari landing.** Alamat vault palsu `0x4Fa1…9c2E` (dipajang di header, panel "Published numbers" dan footer) diganti alamat deployment sungguhan yang tertaut ke explorer. "USDG → 7 pools · 8.42% APY" di allocation tape dan published numbers jadi live. Worked example ($10.000 × 8,42% = $842) jadi live. Allocation tape sekarang menggambar alokasi vault yang sebenarnya dan menerima jumlah pool berapa pun — sebelumnya layout-nya terkunci di 7 tile karangan.
- Dua angka karangan dihapus dari landing: "Depositors" sekarang dihitung dari log `Deposit` on-chain, dan kalkulator live-math memakai blended rate vault sungguhan (6,70%), bukan 8,42% hardcode. Fallback saat chain tak terjangkau kini "—", bukan angka palsu yang tampak nyata.
- **Lapisan material** — kedalaman dipakai hanya untuk keterjelasan fungsi: field deposit/withdraw kini cekung sehingga terbaca menerima input, tombol benar-benar turun saat ditekan, kartu docs terangkat sedikit saat disentuh, dan bar alokasi duduk dalam kanal. Tanpa radius besar dan tanpa blob dua-sumber-cahaya — identitas lama (putih, hairline, mono, biru hanya untuk uang) dipertahankan.
- **Cacat yang ketemu saat pass ini**: nomor seksi `[06]` dobel (Withdraw dan History), tombol nonaktif tampil sebagai balok abu-abu pekat, `$—` dan `≈ $— OUT` yang lolos, `TVL (totalAssets)` yang jadi `TOTALASSETS` karena uppercase, serta halaman `/privacy` dan `/terms` yang yatim tanpa header/footer dan memajang alamat email `support@mosaic.capital` yang tidak ada. Semua diperbaiki; tombol nonaktif sekarang menyebut alasannya (Connect wallet / Switch network / Deposits paused).
- **Target sentuh**: dari 34 elemen di bawah 32px di landing page menjadi 6, dan sisanya 31px atau tautan prosa inline. Area sentuh diperbesar lewat padding yang dikompensasi margin negatif, jadi tidak ada yang bergeser.
- **Pass UI sebelumnya** (diukur lewat CDP, bukan ditebak dari screenshot): overflow horizontal di mobile pada `/whitepaper` dan post blog diperbaiki — `mx-auto` pada grid item mematikan stretch sehingga lebarnya jatuh ke min-content (714px di viewport 390px). Header mobile pindah ke pola dua baris seperti landing page. Daftar isi punya penanda posisi baca. Sel abu-abu menggantung di indeks docs hilang. Empty state dashboard tidak lagi menampilkan `$—` / `— of $—` / `PERFORMANCE FEE — OF YIELD`.
- `npm run build` ✓ · `tsc` ✓ · `lint` ✓ · scrollWidth = viewport di 390/768/1440px

**Upgrade 20 Sep 2026 — tiga fitur dashboard, semua dibaca dari chain**
- **Earned di Your position**: nilai hari ini + yang ditarik − yang disetor, dari event `Deposit`/`Withdraw` milik wallet itu sendiri (`useUserLedger`). Ditahan (tampil "—" plus alasannya) kalau ada share yang masuk/keluar lewat transfer atau fee mint, atau riwayat tak terjangkau.
- **Share price since launch** (`SharePriceChart.tsx`, `useSharePriceHistory`): satu garis dari titik yang memang ada di chain — blok launch tepat 1.0000, tiap `FeeAccrued` (harga pasca-fee), tiap deposit/redeem (assets ÷ shares). Tanpa sampling, tanpa proyeksi; caption menyebut jumlah event.
- **Exit route** di form withdraw (`useExitRoute`): buffer dulu, lalu venue per registry order sesuai yang dilaporkan bebas, plus kekurangan kalau tidak lolos. Tombol tidak mengirim kalau rutenya tidak clear. Diuji di fork Robinhood Chain: rute yang ditampilkan cocok dengan `AdapterWithdraw` yang benar-benar terjadi.
- **Pemindai log adaptif** (`src/lib/logs.ts`): minta seluruh rentang dulu, menyusut hanya kalau provider menolak, span yang berhasil diingat, hasil di-cache per query di browser, refetch cuma membaca ekor. Dipakai History (dulu cuma ~1 jam terakhir di chain sub-detik), Depositors, chart, earned. 15 tes unit (tanpa cap, cap 10k, budget habis, inkremental, prior tidak lengkap).
- **Relay**: jawaban riwayat tertutup (log/blok ≥128 blok di belakang head) disimpan 1 jam di memori; jawaban `null` tidak pernah disimpan — dulu receipt `null` di-cache 2 detik dan bikin viem menganggap tx diganti ("Failed" padahal sukses).
- **`/changelog`** (`content/changelog.md`), tautan di nav konten dan footer landing. Koreksi copy landing: "cheapest exit first" → registry order, "Anyone can trigger it" → keeper yang diizinkan. Diverifikasi di headless Chrome terhadap fork mainnet (state produksi asli): nol console error, `npm run build` ✓, `tsc` ✓, `lint` ✓.

**Konfigurasi produksi**
- `src/lib/chain.ts` tidak lagi placeholder: chain id, RPC, explorer, dan alamat kontrak dibaca dari `NEXT_PUBLIC_*` saat build (`.env.example`). Tanpa env, app jalan di Anvil seperti biasa.
- `contracts/script/DeployProduction.s.sol`: deploy vault ke USDG asli + daftar adapter yang alamatnya disuplai lewat env, set keeper/cap/buffer/fee, `pokeRates()`, lalu serahkan ownership ke multisig dan tulis `deployments/production.json`.
- `docs/SECURITY.md`: trust model, invariant untuk di-fuzz, keputusan desain yang disengaja, celah yang diketahui, checklist deploy.

## Belum selesai ⏳
1. **Angka Robinhood Chain yang asli** — semuanya sudah env-driven, tinggal diisi: chain id, RPC, explorer, alamat USDG, dan **alamat + interface pool Turret**. Adapter Turret sendiri belum bisa ditulis sampai interface-nya publik; `IPoolAdapter` adalah kontraknya (7 fungsi, `MockPoolAdapter` jadi contoh implementasi).
2. **Audit** — belum ada auditor pihak ketiga. `docs/SECURITY.md` + 63 test adalah paket awalnya, bukan penggantinya.
3. ~~Keeper satu hot key tanpa redundansi~~ **selesai** — `RPC_URL` menerima daftar dan gagal-alih berurutan, tiap tick dibatasi `TICK_TIMEOUT_MS` dan tidak bisa melempar keluar dari loop, alert ke webhook (Slack/Discord) untuk kegagalan beruntun / saldo gas menipis / vault dijeda dengan dedupe dan pemberitahuan pulih, plus `GET /health` dan heartbeat file untuk supervisor. Dua instance aman dijalankan bersama karena tiap panggilan disimulasikan dulu. Yang tetap: kuncinya masih hot key.
4. ~~Riwayat UI memindai 100k blok sekaligus~~ **selesai** — kebanyakan RPC membatasi `eth_getLogs` di beberapa ribu blok, jadi pemindaian sekali jalan akan gagal di chain sungguhan. Sekarang berjalan mundur dari kepala dalam potongan (`NEXT_PUBLIC_LOG_CHUNK`, default 10k), berhenti begitu cukup baris, dan dibatasi `NEXT_PUBLIC_LOG_MAX_CHUNKS`. Blok deployment dicatat di deployments json supaya ada dasar pemindaian; tanpa itu jumlah depositor menampilkan "—" alih-alih angka yang diam-diam berarti "sejak blok sekian". **Chain dengan riwayat panjang tetap butuh indexer sungguhan** — ini membuatnya benar dan murah tanpa indexer, bukan menggantikannya.
5. Target sentuh tersisa di landing page ada di 31px (ambang 32px) — praktis selesai, tapi belum persis memenuhi pedoman.

## Repo
`https://github.com/itsnevu/mosaic` — publik, branch `main`. `contracts/lib` (OpenZeppelin + forge-std) ikut di-commit karena dipasang dengan `forge install --no-git`, supaya hasil clone langsung bisa `forge build`.

## Cara jalankan lokal
```bash
npm run chain && npm run deploy:local && npm run abi:sync
npm run dev            # http://localhost:3000  ·  /app
npm run contracts:test
npm run keeper:local   # DRY_RUN=1 untuk simulasi saja, ONCE=1 untuk sekali jalan
```

## Cara jalankan produksi
```bash
cp .env.example .env.local     # isi NEXT_PUBLIC_* dan variabel deploy
RPC_URL=... PRIVATE_KEY=... npm run deploy:production
npm run build && npm run start
RPC_URL=... KEEPER_PRIVATE_KEY=... NATIVE_USD=... npm run keeper
```

## Konten
**Whitepaper** `content/whitepaper.md` → `/whitepaper` — spek protokol sebagaimana diimplementasikan: akuntansi vault, interface adapter, scoring alokasi, ekonomi rebalance, jaminan likuiditas, fee, failure mode, tabel parameter, verifikasi.
**Docs** `content/docs/*.md` → `/docs` — 7 halaman: Overview, How it works, Depositing, Contracts & parameters, Running a keeper, FAQ, Security. Halaman Security me-render `docs/SECURITY.md` langsung supaya versi auditor dan versi situs tidak pernah berbeda.
**Blog** `content/blog/*.md` → `/blog` — dua post: esai "Your Money Is Asleep" (dulu `docs/ARTICLE.md`) dan "Three Bugs Reading the Code Never Found" soal tiga bug yang ditemukan fuzzing.
Semua di-generate statis dengan `generateStaticParams`. Renderer markdown sendiri (`src/lib/content.ts`) dengan frontmatter, anchor heading, dan daftar isi.
Lain-lain: `docs/PRODUCT.md`, thread X 9 post, bio: *"One deposit. Many sources of yield. Zero monitoring."*
