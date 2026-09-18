"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Hero backdrop: a field of small tiles (the 2×2 logo, repeated) that breathe
 * in a slow wave and ripple away from the pointer. Monochrome with the odd
 * accent-blue tile, drawn with one InstancedMesh so it costs almost nothing.
 */
export function MosaicField() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
    camera.position.set(0, 0, 10);

    const COLS = 72, ROWS = 40, GAP = 1.0;
    const count = COLS * ROWS;
    const geo = new THREE.PlaneGeometry(0.62, 0.62);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8 });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    const base = new THREE.Color(0xededf0);
    const dark = new THREE.Color(0xd8d8dd);
    const accent = new THREE.Color(0x2563eb);
    const colors = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      seeds[i] = Math.random();
      const c = seeds[i] > 0.985 ? accent : seeds[i] > 0.6 ? dark : base;
      colors.set([c.r, c.g, c.b], i * 3);
    }
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    scene.add(mesh);

    const pointer = new THREE.Vector2(-100, -100);
    const target = new THREE.Vector2(-100, -100);
    let w = 1, h = 1;
    const toWorld = (cx: number, cy: number) => {
      const r = host.getBoundingClientRect();
      return new THREE.Vector2(((cx - r.left) / r.width - 0.5) * w, -((cy - r.top) / r.height - 0.5) * h);
    };
    const onMove = (e: PointerEvent) => target.copy(toWorld(e.clientX, e.clientY));
    const onLeave = () => target.set(-100, -100);
    window.addEventListener("pointermove", onMove, { passive: true });
    host.parentElement?.addEventListener("pointerleave", onLeave);

    const resize = () => {
      const cw = host.clientWidth, ch = host.clientHeight;
      renderer.setSize(cw, ch, false);
      // World units: one tile pitch = 1; fit COLS across the width.
      w = COLS * GAP; h = w * (ch / cw);
      camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0, visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(host);
    const t0 = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      const t = (now - t0) / 1000;
      pointer.lerp(target, 0.08);
      let i = 0;
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++, i++) {
          const px = (x - COLS / 2 + 0.5) * GAP;
          const py = (y - ROWS / 2 + 0.5) * GAP;
          const wave = Math.sin(px * 0.35 + t * 0.6) * Math.cos(py * 0.3 - t * 0.4);
          const d = Math.hypot(px - pointer.x, py - pointer.y);
          const ripple = Math.exp(-d * d * 0.08) * (1 + 0.4 * Math.sin(d * 1.6 - t * 4));
          const s = 0.4 + wave * 0.2 + ripple * 0.8 + seeds[i] * 0.1;
          dummy.position.set(px, py, 0);
          dummy.scale.setScalar(Math.max(0.08, s));
          dummy.rotation.z = ripple * 0.6;
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      host.parentElement?.removeEventListener("pointerleave", onLeave);
      geo.dispose(); mat.dispose(); renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={ref} className="fx-scene" aria-hidden="true" />;
}
