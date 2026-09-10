/* 2×2 mosaic of small squares — the wordmark glyph. Inline SVG, no assets. */
export default function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      shapeRendering="crispEdges"
      className="block shrink-0"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="10" height="10" fill="currentColor" />
      <rect x="13" y="1" width="10" height="10" fill="currentColor" opacity="0.45" />
      <rect x="1" y="13" width="10" height="10" fill="currentColor" opacity="0.45" />
      <rect x="13" y="13" width="10" height="10" fill="currentColor" />
    </svg>
  );
}
