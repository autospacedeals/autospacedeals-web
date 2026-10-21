// A seller's logo (brokers.logo_url, already squared on its own background
// by lib/broker-logos.ts) filling the tile, or their initials when they
// haven't uploaded one. Decorative: the name is always beside it.
function initials(label: string | null | undefined) {
  return String(label ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

export default function SellerAvatar({
  name,
  logoUrl,
  className = "",
}: {
  name: string | null | undefined;
  logoUrl?: string | null;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <span
        aria-hidden="true"
        className={`avatar overflow-hidden bg-white ${/\brounded/.test(className) ? "" : "rounded-xl"} ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a small logo from our storage */}
        <img src={logoUrl} alt="" className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={`avatar ${className}`}>
      {initials(name)}
    </span>
  );
}
