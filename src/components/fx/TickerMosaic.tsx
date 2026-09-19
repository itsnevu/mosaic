"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * [03] $MOSAIC — the ticker, built the way the vault is built: out of pieces.
 *
 * The wordmark is rasterised once to an offscreen canvas and sampled on a grid;
 * every lit cell becomes one tile of an InstancedMesh. Tiles start scattered
 * through a volume and assemble into the glyphs when the section scrolls into
 * view, with the "$" landing last in accent blue. Behind them, the unlit cells
 * of the same grid sit as a faint field, so the ticker reads as the part of the
 * mosaic that has been bought back into place.
 *
 * Pointer: tilts the camera a few degrees and pushes nearby tiles out of the
 * plane, which then settle. Click or tap scatters and reassembles. Reduced
 * motion renders the assembled state once and stops. No WebGL → HTML fallback.
 */

const TICKER = "$MOSAIC";
const INK = 0x0a0a0a;
const TILE = 0xf4f4f5;
const TILE_DIM = 0x8a8a92;
const ACCENT = 0x2563eb;
const FIELD = 0x1c1c20;

type Tile = {
  tx: number; ty: number;           // target (assembled) position
  sx: number; sy: number; sz: number; // scattered position
  rx: number; ry: number; rz: number; // scattered rotation
  delay: number;                     // 0..1, share of the assembly window
  accent: boolean;
};

function easeOutExpo(t: number) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/** Rasterise the ticker and return one entry per lit grid cell, in grid units. */
function sampleTicker(cols: number, family: string): { tiles: Tile[]; rows: number; field: Array<[number, number]> } {
  const W = 1200;
  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d")!;
  // Fit the word to ~92% of the width, then size the canvas to the glyph box.
  let size = 300;
  ctx.font = `700 ${size}px ${family}`;
  const m0 = ctx.measureText(TICKER);
  size = Math.floor(size * (W * 0.92) / m0.width);
  ctx.font = `700 ${size}px ${family}`;
  const m = ctx.measureText(TICKER);
  const H = Math.ceil((m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) * 1.25);
  cv.width = W; cv.height = H;
  ctx.font = `700 ${size}px ${family}`;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  ctx.fillText(TICKER, W / 2, m.actualBoundingBoxAscent + (H - (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent)) / 2);

  // The "$" alone, same layout, so its cells can be tagged accent.
  const dv = document.createElement("canvas");
  dv.width = W; dv.height = H;
  const dctx = dv.getContext("2d")!;
  dctx.font = ctx.font; dctx.fillStyle = "#fff"; dctx.textBaseline = "alphabetic"; dctx.textAlign = "center";
  const full = m.width;
  const dollar = dctx.measureText("$").width;
  // Draw "$" at the position it occupies inside the centred word.
  dctx.textAlign = "left";
  dctx.fillText("$", W / 2 - full / 2, m.actualBoundingBoxAscent + (H - (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent)) / 2);
  void dollar;

  const pitch = W / cols;
  const rows = Math.round(H / pitch);
  const img = ctx.getImageData(0, 0, W, H).data;
  const dimg = dctx.getImageData(0, 0, W, H).data;
  const tiles: Tile[] = [];
  const field: Array<[number, number]> = [];
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const px = Math.min(W - 1, Math.floor((gx + 0.5) * pitch));
      const py = Math.min(H - 1, Math.floor((gy + 0.5) * pitch));
      const k = (py * W + px) * 4 + 3;
      const lit = img[k] > 120;
      const gxw = gx - cols / 2 + 0.5;
      const gyw = -(gy - rows / 2 + 0.5);
      if (!lit) { field.push([gxw, gyw]); continue; }
      const accent = dimg[k] > 120;
      // Scatter: a wide, shallow cloud, biased to the right so the word "arrives".
      const ang = rand(0, Math.PI * 2);
      const rad = rand(cols * 0.25, cols * 0.7);
      tiles.push({
        tx: gxw, ty: gyw,
        sx: gxw + Math.cos(ang) * rad + cols * 0.15,
        sy: gyw + Math.sin(ang) * rad * 0.55,
        sz: rand(-cols * 0.25, cols * 0.35),
        rx: rand(-2.5, 2.5), ry: rand(-2.5, 2.5), rz: rand(-1.5, 1.5),
        // Letters assemble left to right with jitter; the "$" lands last.
        delay: accent ? rand(0.72, 0.9) : (gx / cols) * 0.55 + rand(0, 0.28),
        accent,
      });
    }
  }
  return { tiles, rows, field };
}

export function TickerMosaic() {
  const ref = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      // No WebGL: flip the wrapper to its HTML wordmark without a React re-render.
      wrap.current?.setAttribute("data-fallback", "1");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 1000);
    scene.add(new THREE.AmbientLight(0xffffff, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-0.6, 1, 1.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x2563eb, 0.35);
    rim.position.set(1, -0.5, 0.6);
    scene.add(rim);

    const COLS = 96;
    const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-sans").trim() || "ui-sans-serif";
    const family = `${fam}, ui-sans-serif, system-ui, sans-serif`;

    let tiles: Tile[] = [];
    let rows = 1;
    let field: Array<[number, number]> = [];
    let mesh: THREE.InstancedMesh | null = null;
    let fieldMesh: THREE.InstancedMesh | null = null;
    const geo = new THREE.BoxGeometry(0.86, 0.86, 0.5);
    const fieldGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const fieldMat = new THREE.MeshBasicMaterial({ color: FIELD, transparent: true, opacity: 0.9 });
    const dummy = new THREE.Object3D();
    const cTile = new THREE.Color(TILE), cDim = new THREE.Color(TILE_DIM), cAcc = new THREE.Color(ACCENT);

    const build = () => {
      const s = sampleTicker(COLS, family);
      tiles = s.tiles; rows = s.rows; field = s.field;
      if (mesh) { scene.remove(mesh); mesh.dispose(); }
      if (fieldMesh) { scene.remove(fieldMesh); fieldMesh.dispose(); }
      mesh = new THREE.InstancedMesh(geo, mat, tiles.length);
      const colors = new Float32Array(tiles.length * 3);
      tiles.forEach((t, i) => {
        const c = t.accent ? cAcc : Math.random() > 0.9 ? cDim : cTile;
        colors.set([c.r, c.g, c.b], i * 3);
      });
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      scene.add(mesh);
      fieldMesh = new THREE.InstancedMesh(fieldGeo, fieldMat, field.length);
      field.forEach(([x, y], i) => {
        dummy.position.set(x, y, -0.6); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
        dummy.updateMatrix(); fieldMesh!.setMatrixAt(i, dummy.matrix);
      });
      fieldMesh.instanceMatrix.needsUpdate = true;
      scene.add(fieldMesh);
    };

    // Wait for the display font so the glyph sampling is the real wordmark.
    const ready = (document.fonts?.load ? document.fonts.load(`700 40px ${family}`) : Promise.resolve()).catch(() => undefined);

    const pointer = new THREE.Vector2(-999, -999);
    const pTarget = new THREE.Vector2(-999, -999);
    const tilt = new THREE.Vector2(0, 0);
    const tTarget = new THREE.Vector2(0, 0);
    let worldW = COLS, worldH = rows;

    const fit = () => {
      const cw = host.clientWidth, ch = host.clientHeight;
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      // Frame the grid width with margin; height follows the aspect.
      worldW = COLS * 1.02;
      worldH = worldW / camera.aspect;
      const dist = (worldH / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      camera.position.set(0, 0, dist);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    };

    const toWorld = (cx: number, cy: number) => {
      const r = host.getBoundingClientRect();
      return new THREE.Vector2(((cx - r.left) / r.width - 0.5) * worldW, -((cy - r.top) / r.height - 0.5) * worldH);
    };
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      pTarget.copy(toWorld(e.clientX, e.clientY));
      tTarget.set(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2);
    };
    const onLeave = () => { pTarget.set(-999, -999); tTarget.set(0, 0); };

    // Assembly clock: progress 0 → 1 over the window; `scatterAt` restarts it.
    const ASSEMBLE_S = 2.6;
    let t0 = -1;
    let progress = reduced ? 1 : 0;
    const start = (now: number) => { t0 = now; };
    const onTap = () => { if (reduced) return; progress = 0; t0 = -1; startPending = true; };
    let startPending = false;

    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onTap);

    let raf = 0, visible = false, armed = false;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !armed) { armed = true; startPending = true; }
    }, { threshold: 0.25 });
    io.observe(host);
    const ro = new ResizeObserver(fit);
    ro.observe(host);

    const draw = (now: number) => {
      if (!mesh) return;
      if (startPending) { start(now); startPending = false; }
      if (t0 >= 0 && !reduced) progress = Math.min(1, (now - t0) / 1000 / ASSEMBLE_S);
      pointer.lerp(pTarget, 0.1);
      tilt.lerp(tTarget, 0.06);
      const t = now / 1000;
      // Camera: a few degrees of tilt toward the pointer.
      const dist = camera.position.length();
      camera.position.set(Math.sin(tilt.x * 0.09) * dist, Math.sin(-tilt.y * 0.06) * dist, Math.cos(tilt.x * 0.09) * dist);
      camera.lookAt(0, 0, 0);

      for (let i = 0; i < tiles.length; i++) {
        const tl = tiles[i];
        const win = 0.45; // each tile's own share of the window
        const local = Math.max(0, Math.min(1, (progress - tl.delay * (1 - win)) / win));
        const k = easeOutExpo(local);
        // Pointer push: out of the plane, fading with distance, only once assembled.
        const dx = tl.tx - pointer.x, dy = tl.ty - pointer.y;
        const d2 = dx * dx + dy * dy;
        const push = k * Math.exp(-d2 * 0.02) * 3.2;
        const breathe = k * Math.sin(t * 0.9 + tl.tx * 0.18 + tl.ty * 0.3) * 0.08;
        dummy.position.set(
          THREE.MathUtils.lerp(tl.sx, tl.tx, k),
          THREE.MathUtils.lerp(tl.sy, tl.ty, k),
          THREE.MathUtils.lerp(tl.sz, 0, k) + push + breathe,
        );
        dummy.rotation.set(tl.rx * (1 - k), tl.ry * (1 - k) + push * 0.12, tl.rz * (1 - k));
        const sc = 0.2 + 0.8 * k;
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      renderer.render(scene, camera);
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      draw(now);
    };

    let disposed = false;
    ready.then(() => {
      if (disposed) return;
      build();
      fit();
      if (reduced) { visible = true; draw(performance.now()); return; }
      raf = requestAnimationFrame(tick);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onTap);
      geo.dispose(); fieldGeo.dispose(); mat.dispose(); fieldMat.dispose();
      mesh?.dispose(); fieldMesh?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={wrap} className="fx-ticker">
      <div ref={ref} className="fx-ticker-scene" aria-hidden="true" />
      <div className="fx-ticker-fallback" aria-hidden="true">
        <span>{TICKER}</span>
      </div>
      <span className="sr-only">{TICKER} wordmark, assembled from tiles.</span>
    </div>
  );
}

export const TICKER_COLORS = { INK, TILE, ACCENT };
