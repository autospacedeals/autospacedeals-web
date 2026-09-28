// components/Logo.tsx — the Drive logo as inline SVG (replaces the old raster
// wordmark PNG, which had a dark road texture baked in).
//
// - Pure paths: no background, no raster, no web font. Crisp at any size.
// - Letters use currentColor (inherit text-fg on the dark site); the blue
//   parallelogram (wordmark i-dot / mark ascender) uses the --brand token via
//   the `fill-brand` utility, so the logo and UI share one blue.
// - Server- and Client-safe (no hooks). The same shapes live as standalone
//   files in public/brand/ (sources for the icons — see scripts/make-brand-assets.mjs).
import type { SVGProps } from "react";

const SKEW = "matrix(1 0 -0.21256 1 0 0)";

// Wordmark: italic lowercase "drive", 445×150 viewBox (aspect 2.967).
const WORDMARK = {
  w: 445,
  h: 150,
  tx: 28.42,
  letters:
    "M34 50H76V0H100V150H34A34 34 0 0 1 0 116V84A34 34 0 0 1 34 50ZM34 74H66A10 10 0 0 1 76 84V116A10 10 0 0 1 66 126H34A10 10 0 0 1 24 116V84A10 10 0 0 1 34 74ZM116 150V84A34 34 0 0 1 150 50H172V74H150A10 10 0 0 0 140 84V150ZM190 50H214V150H190ZM226 50L251.51 50L276 118.03L300.49 50L326 50L290 150L262 150ZM422.05 137.85A34 34 0 0 1 396 150H364A34 34 0 0 1 330 116V84A34 34 0 0 1 364 50H396A34 34 0 0 1 430 84V110H354V116A10 10 0 0 0 364 126H396A10 10 0 0 0 403.66 122.43ZM364 74H396A10 10 0 0 1 406 84V90H354V84A10 10 0 0 1 364 74Z",
  dot: "M185 6H219V30H185Z",
};

// Mark: the wordmark's "d" with its ascender in brand blue (continuous stem). Square 140×140.
const MARK = {
  size: 140,
  tx: 31.65,
  ty: 0,
  bowl: "M34 40H76V40H100V140H34A34 34 0 0 1 0 106V74A34 34 0 0 1 34 40ZM34 64H66A10 10 0 0 1 76 74V106A10 10 0 0 1 66 116H34A10 10 0 0 1 24 106V74A10 10 0 0 1 34 64Z",
  ascender: "M76 0H100V41H76Z",
};

export type LogoVariant = "wordmark" | "mark";

export type LogoProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "children" | "width" | "height"> & {
  /** "wordmark" (default) = full "drive" lockup · "mark" = square "d" symbol */
  variant?: LogoVariant;
  /** Rendered height in px; width follows the aspect ratio. Omit and size with
   *  className instead (e.g. "h-7 w-auto"). Default 28 (wordmark) / 32 (mark). */
  size?: number;
  /** Accessible name when the logo stands alone. */
  title?: string;
  /** Hide from assistive tech — use when a parent link already has aria-label. */
  decorative?: boolean;
};

export function Logo({ variant = "wordmark", size, title = "Drive", decorative, ...props }: LogoProps) {
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": title } as const);

  if (variant === "mark") {
    const h = size ?? 32;
    return (
      <svg viewBox={`0 0 ${MARK.size} ${MARK.size}`} width={h} height={h} fill="none" focusable="false" {...a11y} {...props}>
        <g transform={`translate(${MARK.tx} ${MARK.ty}) ${SKEW}`}>
          <path className="fill-brand" d={MARK.ascender} />
          <path fill="currentColor" fillRule="evenodd" d={MARK.bowl} />
        </g>
      </svg>
    );
  }

  const h = size ?? 28;
  return (
    <svg
      viewBox={`0 0 ${WORDMARK.w} ${WORDMARK.h}`}
      width={Math.round((h * WORDMARK.w) / WORDMARK.h)}
      height={h}
      fill="none"
      focusable="false"
      {...a11y}
      {...props}
    >
      <g transform={`translate(${WORDMARK.tx} 0) ${SKEW}`}>
        <path fill="currentColor" fillRule="evenodd" d={WORDMARK.letters} />
        <path className="fill-brand" d={WORDMARK.dot} />
      </g>
    </svg>
  );
}

export const LogoWordmark = (props: Omit<LogoProps, "variant">) => <Logo variant="wordmark" {...props} />;
export const LogoMark = (props: Omit<LogoProps, "variant">) => <Logo variant="mark" {...props} />;

export default Logo;
