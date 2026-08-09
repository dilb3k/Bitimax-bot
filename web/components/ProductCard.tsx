import { Product, TRUST_LABEL, botLink, formatUzs, timeAgo } from '@/lib/api';

const TRUST_STYLE: Record<string, string> = {
  new: 'text-faint',
  verified: 'text-vault',
  trusted: 'text-vault',
  partner: 'text-seal',
};

export function ProductCard({ product }: { product: Product }) {
  const seller = product.seller;

  return (
    <article className="surface group flex flex-col p-5 transition duration-200 hover:border-seal/40 hover:shadow-[0_1px_0_rgb(var(--seal)/.25),0_12px_28px_-18px_rgb(var(--ink)/.35)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className="rounded-md bg-raised px-2 py-1 text-xs font-medium text-muted">
          {product.category}
        </span>
        <time className="shrink-0 text-xs text-faint" dateTime={product.createdAt}>
          {timeAgo(product.createdAt)}
        </time>
      </div>

      <h3 className="mb-2 text-[17px] font-semibold leading-snug text-ink">{product.title}</h3>

      <p className="mb-4 line-clamp-2 flex-1 text-sm leading-relaxed text-muted">
        {product.description}
      </p>

      {seller && (
        <div className="mb-4 flex items-center gap-2 text-xs">
          <span className={`font-medium ${TRUST_STYLE[seller.trustLevel] ?? 'text-faint'}`}>
            {TRUST_LABEL[seller.trustLevel]}
          </span>
          {seller.rating !== null && (
            <>
              <span className="text-faint">·</span>
              <span className="tnum text-muted">
                ★ {seller.rating.toFixed(1)}{' '}
                <span className="text-faint">({seller.ratingCount})</span>
              </span>
            </>
          )}
          {seller.sold > 0 && (
            <>
              <span className="text-faint">·</span>
              <span className="tnum text-faint">{seller.sold} ta sotgan</span>
            </>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="tnum text-lg font-bold text-ink">{formatUzs(product.price)}</span>
        <a
          href={botLink(product._id)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-seal px-3.5 py-2 text-sm"
        >
          Sotib olish
        </a>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="surface flex flex-col gap-3 p-5" aria-hidden="true">
      <div className="flex justify-between">
        <div className="skeleton h-6 w-20" />
        <div className="skeleton h-4 w-16" />
      </div>
      <div className="skeleton h-5 w-4/5" />
      <div className="skeleton h-4 w-full" />
      <div className="skeleton h-4 w-2/3" />
      <div className="mt-3 flex items-center justify-between border-t border-line pt-4">
        <div className="skeleton h-6 w-28" />
        <div className="skeleton h-9 w-24" />
      </div>
    </div>
  );
}
