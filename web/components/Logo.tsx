import Image from 'next/image';

/**
 * The Bitimax mark: a B split into a cyan half and a slate half, shaking hands across the
 * middle. Buyer and seller, the platform holding the join — the same idea the product is.
 *
 * Served as a transparent PNG rather than inline SVG because the artwork carries soft gradients
 * that don't survive a hand-traced redraw. next/image emits width and height so it never causes
 * layout shift, and `priority` on the header instance keeps it out of the lazy-load queue.
 */
export function LogoMark({
  size = 32,
  className = '',
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={Math.round(size * 0.846)} // the mark is 641×758, so keep its natural ratio
      height={size}
      className={className}
      priority={priority}
      aria-hidden="true"
    />
  );
}

export function Logo({ className = '', priority = false }: { className?: string; priority?: boolean }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={30} priority={priority} />
      <span className="font-display text-xl font-extrabold tracking-tight text-ink">Bitimax</span>
    </span>
  );
}
