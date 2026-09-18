/* Shared helpers for the key visuals. Loaded at the end of each HTML file. */

/* The hero tile field (src/components/fx/MosaicField.tsx), frozen at one frame.
   opts: cols, rows, t (time), accentRate, base/dark/accent, alpha, pointer {x,y} in tile units */
function drawField(canvas, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  canvas.width = cw * dpr; canvas.height = ch * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const COLS = opts.cols ?? 72;
  const pitch = cw / COLS;
  const ROWS = opts.rows ?? Math.ceil(ch / pitch) + 1;
  const t = opts.t ?? 2.4;
  const base = opts.base ?? "#ededf0";
  const dark = opts.dark ?? "#d8d8dd";
  const accent = opts.accent ?? "#2563eb";
  const accentRate = opts.accentRate ?? 0.015;
  const size = opts.size ?? 0.62;
  ctx.globalAlpha = opts.alpha ?? 0.8;

  // deterministic seeds so re-renders are identical
  let s = opts.seed ?? 7;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };

  const px0 = opts.pointer ? opts.pointer.x : -100;
  const py0 = opts.pointer ? opts.pointer.y : -100;

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const seed = rnd();
      const px = x - COLS / 2 + 0.5;
      const py = y - ROWS / 2 + 0.5;
      const wave = Math.sin(px * 0.35 + t * 0.6) * Math.cos(py * 0.3 - t * 0.4);
      const d = Math.hypot(px - px0, py - py0);
      const ripple = Math.exp(-d * d * 0.08) * (1 + 0.4 * Math.sin(d * 1.6 - t * 4));
      const sc = Math.max(0.08, 0.4 + wave * 0.2 + ripple * 0.8 + seed * 0.1);
      const side = size * pitch * sc;
      const cx = (x + 0.5) * pitch, cy = (y + 0.5) * pitch;
      ctx.fillStyle = seed > 1 - accentRate ? accent : seed > 0.6 ? dark : base;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ripple * 0.6);
      ctx.fillRect(-side / 2, -side / 2, side, side);
      ctx.restore();
    }
  }
}

/* Share-price line: a monotone rising path with hairline gridlines. */
function drawPrice(canvas, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  canvas.width = cw * dpr; canvas.height = ch * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const n = opts.points ?? 48;
  const pad = opts.pad ?? 0;
  const color = opts.color ?? "#2563eb";
  const gridColor = opts.grid ?? "rgba(0,0,0,0.08)";
  let s = opts.seed ?? 3;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };

  // gridlines
  ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
  const rows = opts.rows ?? 5;
  for (let i = 0; i <= rows; i++) {
    const y = pad + ((ch - pad * 2) * i) / rows + 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
  }

  // path: only ever up or flat (a share price never invents a down day)
  const pts = []; let v = 0;
  for (let i = 0; i < n; i++) { v += rnd() < 0.18 ? 0 : rnd() * 1.4 + 0.2; pts.push(v); }
  const max = pts[n - 1];
  const X = (i) => (cw * i) / (n - 1);
  const Y = (p) => ch - pad - ((ch - pad * 2) * p) / max;

  ctx.strokeStyle = color; ctx.lineWidth = opts.width ?? 2; ctx.lineJoin = "miter";
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(X(i), Y(p)) : ctx.moveTo(X(i), Y(p))));
  ctx.stroke();

  // endpoint marker: square, like the slider thumb
  const ex = X(n - 1), ey = Y(max);
  ctx.fillStyle = color; ctx.fillRect(ex - 7, ey - 7, 14, 14);
  ctx.strokeStyle = opts.bg ?? "#fff"; ctx.lineWidth = 2; ctx.strokeRect(ex - 5, ey - 5, 10, 10);
}

/* Phosphor glyphs used on the site (src/components/icons.tsx). */
const ICONS = {
  wallet: "M216,64H56a8,8,0,0,1,0-16H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm0,128H56a8,8,0,0,1-8-8V78.63A23.84,23.84,0,0,0,56,80H216Zm-48-60a12,12,0,1,1,12,12A12,12,0,0,1,168,132Z",
  coins: "M184,89.57V84c0-25.08-37.83-44-88-44S8,58.92,8,84v40c0,20.89,26.25,37.49,64,42.46V172c0,25.08,37.83,44,88,44s88-18.92,88-44V132C248,111.3,222.58,94.68,184,89.57ZM232,132c0,13.22-30.79,28-72,28-3.73,0-7.43-.13-11.08-.37C170.49,151.77,184,139,184,124V105.74C213.87,110.19,232,122.27,232,132ZM72,150.25V126.46A183.74,183.74,0,0,0,96,128a183.74,183.74,0,0,0,24-1.54v23.79A163,163,0,0,1,96,152,163,163,0,0,1,72,150.25Zm96-40.32V124c0,8.39-12.41,17.4-32,22.87V123.5C148.91,120.37,159.84,115.71,168,109.93ZM96,56c41.21,0,72,14.78,72,28s-30.79,28-72,28S24,97.22,24,84,54.79,56,96,56ZM24,124V109.93c8.16,5.78,19.09,10.44,32,13.57v23.37C36.41,141.4,24,132.39,24,124Zm64,48v-4.17c2.63.1,5.29.17,8,.17,3.88,0,7.67-.13,11.39-.35A121.92,121.92,0,0,0,120,171.41v23.46C100.41,189.4,88,180.39,88,172Zm48,26.25V174.4a179.48,179.48,0,0,0,24,1.6,183.74,183.74,0,0,0,24-1.54v23.79a165.45,165.45,0,0,1-48,0Zm64-3.38V171.5c12.91-3.13,23.84-7.79,32-13.57V172C232,180.39,219.59,189.4,200,194.87Z",
  hash: "M216,152H168V104h48a8,8,0,0,0,0-16H168V40a8,8,0,0,0-16,0V88H104V40a8,8,0,0,0-16,0V88H40a8,8,0,0,0,0,16H88v48H40a8,8,0,0,0,0,16H88v48a8,8,0,0,0,16,0V168h48v48a8,8,0,0,0,16,0V168h48a8,8,0,0,0,0-16Zm-112,0V104h48v48Z",
  scales: "M239.43,133l-32-80h0a8,8,0,0,0-9.16-4.84L136,62V40a8,8,0,0,0-16,0V65.58L54.26,80.19A8,8,0,0,0,48.57,85h0v.06L16.57,165a7.92,7.92,0,0,0-.57,3c0,23.31,24.54,32,40,32s40-8.69,40-32a7.92,7.92,0,0,0-.57-3L66.92,93.77,120,82V208H104a8,8,0,0,0,0,16h48a8,8,0,0,0,0-16H136V78.42L187,67.1,160.57,133a7.92,7.92,0,0,0-.57,3c0,23.31,24.54,32,40,32s40-8.69,40-32A7.92,7.92,0,0,0,239.43,133ZM56,184c-7.53,0-22.76-3.61-23.93-14.64L56,109.54l23.93,59.82C78.76,180.39,63.53,184,56,184Zm144-32c-7.53,0-22.76-3.61-23.93-14.64L200,77.54l23.93,59.82C222.76,148.39,207.53,152,200,152Z",
  arrowsClockwise: "M228,48V96a12,12,0,0,1-12,12H168a12,12,0,0,1,0-24h19l-7.8-7.8a75.55,75.55,0,0,0-53.32-22.26h-.43A75.49,75.49,0,0,0,72.39,75.57,12,12,0,1,1,55.61,58.41a99.38,99.38,0,0,1,69.87-28.47H126A99.42,99.42,0,0,1,196.2,59.23L204,67V48a12,12,0,0,1,24,0ZM183.61,180.43a75.49,75.49,0,0,1-53.09,21.63h-.43A75.55,75.55,0,0,1,76.77,179.8L69,172H88a12,12,0,0,0,0-24H40a12,12,0,0,0-12,12v48a12,12,0,0,0,24,0V189l7.8,7.8A99.42,99.42,0,0,0,130,226.06h.56a99.38,99.38,0,0,0,69.87-28.47,12,12,0,0,0-16.78-17.16Z",
  arrowsLeftRight: "M213.66,181.66l-32,32a8,8,0,0,1-11.32-11.32L188.69,184H48a8,8,0,0,1,0-16H188.69l-18.35-18.34a8,8,0,0,1,11.32-11.32l32,32A8,8,0,0,1,213.66,181.66Zm-139.32-64a8,8,0,0,0,11.32-11.32L67.31,88H208a8,8,0,0,0,0-16H67.31L85.66,53.66A8,8,0,0,0,74.34,42.34l-32,32a8,8,0,0,0,0,11.32Z",
  chartLineUp: "M232,208a8,8,0,0,1-8,8H32a8,8,0,0,1-8-8V48a8,8,0,0,1,16,0V156.69l50.34-50.35a8,8,0,0,1,11.32,0L128,132.69,180.69,80H160a8,8,0,0,1,0-16h40a8,8,0,0,1,8,8v40a8,8,0,0,1-16,0V91.31l-58.34,58.35a8,8,0,0,1-11.32,0L96,123.31l-56,56V200H224A8,8,0,0,1,232,208Z",
  clock: "M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z",
  shield: "M208,40H48A16,16,0,0,0,32,56v58.78c0,89.61,75.82,119.34,91,124.39a15.53,15.53,0,0,0,10,0c15.2-5.05,91-34.78,91-124.39V56A16,16,0,0,0,208,40Zm0,74.79c0,78.42-66.35,104.62-80,109.18-13.53-4.51-80-30.69-80-109.18V56H208Z",
  stack: "M230.91,172A8,8,0,0,1,228,182.91l-96,56a8,8,0,0,1-8.06,0l-96-56A8,8,0,0,1,36,169.09l92,53.65,92-53.65A8,8,0,0,1,230.91,172ZM220,121.09l-92,53.65L36,121.09A8,8,0,0,0,28,134.91l96,56a8,8,0,0,0,8.06,0l96-56A8,8,0,1,0,220,121.09ZM24,80a8,8,0,0,1,4-6.91l96-56a8,8,0,0,1,8.06,0l96,56a8,8,0,0,1,0,13.82l-96,56a8,8,0,0,1-8.06,0l-96-56A8,8,0,0,1,24,80Zm23.88,0L128,126.74,208.12,80,128,33.26Z",
  arrowLineUp: "M216,32H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Zm-82.34,34.34a8,8,0,0,0-11.32,0l-72,72a8,8,0,0,0,11.32,11.32L120,91.31V216a8,8,0,0,0,16,0V91.31l58.34,58.35a8,8,0,0,0,11.32-11.32Z",
  fileText: "M168,152a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,152Zm-8-40H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16Zm56-64V216a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V48A16,16,0,0,1,56,32H92.26a47.92,47.92,0,0,1,71.48,0H200A16,16,0,0,1,216,48ZM96,64h64a32,32,0,0,0-64,0ZM200,48H173.25A47.93,47.93,0,0,1,176,64v8a8,8,0,0,1-8,8H88a8,8,0,0,1-8-8V64a47.93,47.93,0,0,1,2.75-16H56V216H200Z",
};
document.querySelectorAll("[data-icon]").forEach((el) => {
  const d = ICONS[el.dataset.icon];
  if (!d) return;
  el.innerHTML = `<svg class="icon" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`;
});
document.querySelectorAll("canvas[data-field]").forEach((c) => drawField(c, JSON.parse(c.dataset.field || "{}")));
document.querySelectorAll("canvas[data-price]").forEach((c) => drawPrice(c, JSON.parse(c.dataset.price || "{}")));
