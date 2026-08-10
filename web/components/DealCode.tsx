import { botLink } from '@/lib/api';

/**
 * Explains the escrow-only path: two people who already agreed a price elsewhere use Bitimax
 * purely as the guarantor. This is the larger of the two use cases in practice — most Telegram
 * account trades start in a private chat, not in a catalog — so it gets its own section rather
 * than a footnote under the marketplace.
 */
export function DealCode() {
  return (
    <section id="qanday" className="border-b border-line bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-raised px-3 py-1.5 text-xs font-medium text-muted">
              Xaridor allaqachon topilganmi?
            </p>

            <h2 className="text-2xl font-bold leading-tight text-ink sm:text-4xl">
              Kelishib bo‘lgan bo‘lsangiz — Bitimax faqat kafil bo‘ladi.
            </h2>

            <p className="mt-4 max-w-prose text-base leading-relaxed text-muted">
              E’lon berishning, moderatsiya kutishning hojati yo‘q. Sotuvchi bitim yaratadi va{' '}
              <strong className="font-semibold text-ink">kod</strong> oladi. Xaridor shu kodni
              kiritadi — va pul kafilga tushadi. Bitim katalogda ko‘rinmaydi, uni faqat kod bilan
              ochish mumkin.
            </p>

            <ol className="mt-7 space-y-3.5">
              {[
                'Sotuvchi botda “Kelishilgan bitim” ni tanlaydi — 4 ta savol, 1 daqiqa.',
                'Bot 8 belgili kod beradi. Sotuvchi uni xaridorga yuboradi.',
                'Xaridor “Kod bilan sotib olish” → kodni kiritadi → to‘laydi.',
                'Xaridor akkauntni tekshiradi va tasdiqlaydi — pul sotuvchiga o‘tadi.',
              ].map((step, index) => (
                <li key={step} className="flex gap-3.5">
                  <span className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-ink">
                    {index + 1}
                  </span>
                  <span className="text-sm leading-relaxed text-muted">{step}</span>
                </li>
              ))}
            </ol>

            <a
              href={botLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-accent mt-8"
            >
              Bitim yaratish
            </a>
          </div>

          <CodeVisual />
        </div>
      </div>
    </section>
  );
}

/**
 * A literal picture of the handover: the code moves from seller to buyer, the money doesn't
 * move until the buyer says so. Plain markup rather than an image so it stays sharp, themes
 * correctly and costs nothing to load.
 */
function CodeVisual() {
  return (
    <div className="surface relative overflow-hidden p-6 sm:p-8" aria-hidden="true">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(24rem 16rem at 85% 0%, rgb(var(--accent) / .14), transparent 65%)',
        }}
      />

      <div className="relative space-y-4">
        <div className="flex items-center justify-between text-xs text-faint">
          <span>Sotuvchi</span>
          <span>Xaridor</span>
        </div>

        <div className="rounded-lg border border-line bg-ground p-4">
          <p className="text-xs text-faint">Bitim kodi</p>
          {/* Plain hyphen and moderate tracking so this reads as the exact string the bot
              hands out — an en dash here would have people typing the wrong character. */}
          <p className="tnum mt-1.5 font-mono text-2xl font-bold tracking-[0.1em] text-ink sm:text-3xl">
            K7QP-4M2X
          </p>
        </div>

        <div className="flex items-center gap-3 text-faint">
          <span className="h-px flex-1 bg-line" />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="h-px flex-1 bg-line" />
        </div>

        <div className="space-y-2.5 rounded-lg border border-line bg-ground p-4">
          <Row label="Summa" value="1 200 000 so'm" strong />
          <Row label="Holat" value="Kafilda saqlanmoqda" tone="seal" />
          <Row label="Sotuvchiga o'tadi" value="Siz tasdiqlagach" />
        </div>

        <div className="flex gap-2">
          <span className="flex-1 rounded-lg bg-ok px-3 py-2.5 text-center text-sm font-medium text-white">
            Tasdiqlayman
          </span>
          <span className="flex-1 rounded-lg border border-line px-3 py-2.5 text-center text-sm font-medium text-muted">
            Qaytarish
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'seal';
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-faint">{label}</span>
      <span
        className={
          tone === 'seal'
            ? 'font-medium text-accent'
            : strong
              ? 'tnum font-semibold text-ink'
              : 'text-muted'
        }
      >
        {value}
      </span>
    </div>
  );
}
