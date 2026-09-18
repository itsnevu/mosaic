/* Brand mark — /public/mosaiclogo.jpg, sized by the caller. */
export default function Logo({ size = 24 }: { size?: number }) {
  return (
    <img
      src="/mosaiclogo.jpg"
      alt=""
      width={size}
      height={size}
      className="block shrink-0 rounded-sm object-cover"
      aria-hidden="true"
    />
  );
}
