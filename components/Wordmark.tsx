// The DRIVE wordmark: the word set in wide Archivo capitals, spaced out.
// Plain text (not an SVG), so it takes the current text colour and scales
// with its font size. The older italic "drive" logo (components/Logo.tsx)
// still draws the icons in public/brand/.
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block font-display leading-none font-bold tracking-[0.42em] uppercase [font-variation-settings:'wdth'_125] ${className}`}
      // The last letter's spacing would otherwise leave the word off-centre.
      style={{ marginRight: "-0.42em" }}
    >
      Drive
    </span>
  );
}
