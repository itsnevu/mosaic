"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/** Wrap each word of a heading in a span (once) so it can be staggered. */
function splitWords(el: HTMLElement) {
  if (el.dataset.split) return Array.from(el.querySelectorAll<HTMLElement>(".w"));
  const frag = document.createDocumentFragment();
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent!.split(/(\s+)/).forEach((tok) => {
        if (!tok) return;
        if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(" ")); return; }
        const s = document.createElement("span");
        s.className = "w"; s.textContent = tok;
        frag.appendChild(s);
      });
    } else frag.appendChild(node.cloneNode(true));
  });
  el.replaceChildren(frag);
  el.dataset.split = "1";
  return Array.from(el.querySelectorAll<HTMLElement>(".w"));
}

/** "$2,000,000" → count from 0 keeping prefix/suffix and separators. */
function countUp(el: HTMLElement) {
  const raw = el.textContent ?? "";
  const m = raw.match(/^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/s);
  if (!m) return;
  const [, pre, num, post] = m;
  const target = parseFloat(num.replace(/,/g, ""));
  const decimals = (num.split(".")[1] ?? "").length;
  const obj = { v: 0 };
  gsap.to(obj, {
    v: target, duration: 1.6, ease: "power3.out",
    scrollTrigger: { trigger: el, start: "top 90%", once: true },
    onUpdate: () => {
      el.textContent = pre + obj.v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + post;
    },
  });
}

/**
 * Landing motion. Hero: staged entrance. Sections: headings rise word by word,
 * cards and articles stagger in, figures count up. Reduced motion → nothing.
 */
export function Motion() {
  useEffect(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const main = document.querySelector("main");
      if (!main) return;

      // --- scroll progress hairline under the header.
      const bar = document.createElement("div");
      bar.className = "fx-progress";
      document.body.appendChild(bar);
      gsap.to(bar, { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });

      // --- hero
      const hero = main.querySelector<HTMLElement>("section");
      if (hero) {
        const h1 = hero.querySelector<HTMLElement>("h1");
        const words = h1 ? splitWords(h1) : [];
        const left = hero.querySelector<HTMLElement>(".min-w-0");
        const rest = left ? Array.from(left.children).filter((c) => c !== h1) : [];
        gsap.timeline({ defaults: { ease: "expo.out" } })
          .from("header", { y: -16, opacity: 0, duration: 0.9 }, 0)
          .from(".fx-scene", { opacity: 0, duration: 1.8, ease: "power2.out" }, 0)
          .from(words, { yPercent: 105, opacity: 0, duration: 1.1, stagger: 0.07 }, 0.1)
          .from(rest, { y: 24, opacity: 0, duration: 0.9, stagger: 0.08 }, 0.35)
          .from(hero.querySelector(".max-w-\\[480px\\]"), { x: 40, opacity: 0, duration: 1.2 }, 0.5);
        gsap.to(".fx-scene", {
          yPercent: 25, opacity: 0.2, ease: "none",
          scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
        });
      }

      // --- section headings
      gsap.utils.toArray<HTMLElement>("main h2").forEach((h) => {
        const words = splitWords(h);
        gsap.from(words, {
          yPercent: 100, opacity: 0, duration: 0.9, stagger: 0.05, ease: "expo.out",
          scrollTrigger: { trigger: h, start: "top 88%", once: true },
        });
      });

      // --- grids of cards / articles / list items: stagger as a batch
      gsap.utils.toArray<HTMLElement>("main section :is(article, li, [data-card])").forEach((el) => {
        gsap.from(el, {
          y: 28, opacity: 0, duration: 0.8, ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 92%", once: true },
        });
      });

      // --- numbers
      gsap.utils.toArray<HTMLElement>("main .tabular-nums").forEach((el) => {
        if (el.children.length === 0) countUp(el);
      });

      // --- magnetic CTAs
      gsap.utils.toArray<HTMLElement>("main a[href='/app'], header a[href='/app']").forEach((b) => {
        const x = gsap.quickTo(b, "x", { duration: 0.4, ease: "power3" });
        const y = gsap.quickTo(b, "y", { duration: 0.4, ease: "power3" });
        b.addEventListener("pointermove", (e) => {
          const r = b.getBoundingClientRect();
          x((e.clientX - (r.left + r.width / 2)) * 0.2);
          y((e.clientY - (r.top + r.height / 2)) * 0.3);
        });
        b.addEventListener("pointerleave", () => { x(0); y(0); });
      });
    });
    return () => mm.revert();
  }, []);
  return null;
}
