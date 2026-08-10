/**
 * Bitimax mark.
 *
 * A wax seal, not a shield or a generic trust badge: the product is a guarantee stamped
 * between two parties, and the seam splitting the B into two bowls is that guarantee — buyer
 * above, seller below, the platform holding the line between them. It reads as a solid "B"
 * at 16px in a browser tab and keeps the idea at 256px.
 */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="Bitimax"
    >
      <defs>
        <linearGradient id="bitimax-seal" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D9A250" />
          <stop offset="0.55" stopColor="#B0761E" />
          <stop offset="1" stopColor="#7C4F10" />
        </linearGradient>
      </defs>

      {/* Seal body — a squircle rather than a circle so it sits square in a tab favicon. */}
      <rect x="2" y="2" width="60" height="60" rx="19" fill="url(#bitimax-seal)" />

      {/* Hairline highlight along the top edge: reads as pressed wax instead of flat fill. */}
      <rect
        x="2.75"
        y="2.75"
        width="58.5"
        height="58.5"
        rx="18.25"
        stroke="#FFF3DC"
        strokeOpacity="0.28"
        strokeWidth="1.5"
      />

      {/* Upper bowl — the buyer's half. */}
      <path
        d="M19 15h14.5a7.5 7.5 0 0 1 0 15H19V15Z"
        fill="#FFFCF6"
      />
      {/* Lower bowl — the seller's half, wider so the letter sits on a stable base. */}
      <path
        d="M19 34h18a7.5 7.5 0 0 1 0 15H19V34Z"
        fill="#FFFCF6"
      />
      {/* The seam: the gap between the two halves, held open by the platform. */}
      <rect x="19" y="30" width="24" height="4" fill="url(#bitimax-seal)" />
    </svg>
  );
}

/** Mark plus wordmark, for the header and the footer. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={30} />
      <span className="font-display text-xl font-extrabold tracking-tight text-ink">Bitimax</span>
    </span>
  );
}
