'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CategoryCount,
  Pagination,
  Product,
  fetchCategories,
  fetchProducts,
} from '@/lib/api';
import { ProductCard, ProductCardSkeleton } from './ProductCard';

const SORTS = [
  { value: '-createdAt', label: 'Yangi' },
  { value: 'price', label: 'Arzon' },
  { value: '-price', label: 'Qimmat' },
];

export function Catalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 24,
    total: 0,
    pages: 0,
  });
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('-createdAt');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  // Debounce the search box. The previous version fired a request on every keystroke, which
  // meant a five-letter query cost five round trips and the answers could arrive out of order.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    // Abort the in-flight request so a slow earlier response can't overwrite a newer one.
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const data = await fetchProducts({ page, category, search, sort }, controller.signal);
      setProducts(data.products);
      setPagination(data.pagination);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError('Mahsulotlarni yuklab bo‘lmadi. Internetni tekshirib, qayta urinib ko‘ring.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [page, category, search, sort]);

  useEffect(() => {
    load();
    return () => requestRef.current?.abort();
  }, [load]);

  function pickCategory(value: string) {
    setCategory(value);
    setPage(1);
  }

  return (
    <section id="katalog" className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-ink sm:text-3xl">Katalog</h2>
          <p className="mt-1.5 text-sm text-muted">
            {loading && products.length === 0 ? (
              'Yuklanmoqda…'
            ) : (
              <>
                <span className="tnum font-medium text-ink">{pagination.total}</span> ta e’lon
                {category && ` · ${category}`}
              </>
            )}
          </p>
        </div>

        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
          {SORTS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setSort(option.value);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                sort === option.value
                  ? 'bg-seal-soft font-medium text-ink'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <label className="sr-only" htmlFor="qidiruv">
          Qidirish
        </label>
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            id="qidiruv"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Akkaunt nomi, tavsifi yoki tegi bo‘yicha qidiring…"
            className="field pl-10"
          />
        </div>
      </div>

      <div className="mb-8 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => pickCategory('')}
          className={`chip ${category === '' ? 'chip-on' : ''}`}
        >
          Barchasi
        </button>
        {categories.map((item) => (
          <button
            key={item.category}
            type="button"
            onClick={() => pickCategory(item.category)}
            className={`chip ${category === item.category ? 'chip-on' : ''}`}
          >
            {item.category}
            {item.count > 0 && <span className="tnum text-faint">{item.count}</span>}
          </button>
        ))}
      </div>

      {error ? (
        <div className="surface p-10 text-center">
          <p className="text-ink">{error}</p>
          <button type="button" onClick={load} className="btn-ghost mt-4">
            Qayta urinish
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          hasFilters={Boolean(search || category)}
          onReset={() => {
            setSearchInput('');
            setCategory('');
            setPage(1);
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
          <Pager pagination={pagination} onChange={setPage} />
        </>
      )}
    </section>
  );
}

function EmptyState({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) {
  return (
    <div className="surface px-6 py-16 text-center">
      <p className="font-display text-lg font-semibold text-ink">
        {hasFilters ? 'Bu so‘rov bo‘yicha hech narsa topilmadi' : 'Katalog hozircha bo‘sh'}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
        {hasFilters
          ? 'Boshqa kalit so‘z bilan qidiring yoki kategoriyani o‘zgartiring.'
          : 'Birinchi e’lonlar tez orada paydo bo‘ladi. Botga kirib xabardor bo‘lib turing.'}
      </p>
      {hasFilters && (
        <button type="button" onClick={onReset} className="btn-ghost mt-5">
          Filtrlarni tozalash
        </button>
      )}
    </div>
  );
}

function Pager({
  pagination,
  onChange,
}: {
  pagination: Pagination;
  onChange: (page: number) => void;
}) {
  if (pagination.pages <= 1) return null;

  const { page, pages } = pagination;
  // Show the first, last, and a window around the current page; everything else collapses.
  const visible = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === pages || Math.abs(n - page) <= 1
  );

  function go(next: number) {
    onChange(next);
    document.getElementById('katalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <nav className="mt-10 flex items-center justify-center gap-1.5" aria-label="Sahifalash">
      <button
        type="button"
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        className="btn-ghost px-3 py-2 text-sm"
      >
        ← Oldingi
      </button>

      {visible.map((n, index) => (
        <span key={n} className="flex items-center">
          {index > 0 && visible[index - 1] !== n - 1 && (
            <span className="px-1.5 text-faint">…</span>
          )}
          <button
            type="button"
            onClick={() => go(n)}
            aria-current={n === page ? 'page' : undefined}
            className={`tnum h-10 w-10 rounded-lg text-sm font-medium transition ${
              n === page
                ? 'bg-seal text-[rgb(var(--seal-ink))]'
                : 'border border-line bg-surface text-muted hover:text-ink'
            }`}
          >
            {n}
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={() => go(page + 1)}
        disabled={page >= pages}
        className="btn-ghost px-3 py-2 text-sm"
      >
        Keyingi →
      </button>
    </nav>
  );
}
