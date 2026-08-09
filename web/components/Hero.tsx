import { PlatformStats, botLink, formatUzs } from '@/lib/api';

/**
 * The hero has one job: answer "why would I send money to a stranger's card?" before the
 * visitor scrolls. So the headline is the guarantee itself, and the three steps underneath
 * are the mechanism rather than marketing — a visitor who reads only this block already
 * understands what escrow buys them.
 */
export function Hero({ stats }: { stats: PlatformStats | null }) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      {/* Warm seal-coloured wash, kept faint so the type stays the loudest thing here. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          background:
            'radial-gradient(60rem 28rem at 12% -10%, rgb(var(--seal) / .16), transparent 60%)',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-seal/30 bg-seal-soft px-3 py-1.5 text-xs font-medium text-ink">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-seal" />
          P2P Escrow · Kafil xizmati
        </p>

        <h1 className="max-w-[19ch] text-4xl font-extrabold leading-[1.05] text-ink sm:text-6xl">
          Pulingiz siz tasdiqlamaguningizcha sotuvchiga o‘tmaydi.
        </h1>

        <p className="mt-5 max-w-prose text-base leading-relaxed text-muted sm:text-lg">
          Raqamli akkauntlarni sotib olish har doim ishonchga tayangan. Bitimax o‘rtada turadi:
          to‘lovingiz kafilda saqlanadi, siz akkauntni tekshirasiz, va faqat shundan keyin pul
          sotuvchiga o‘tadi.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a href={botLink()} target="_blank" rel="noopener noreferrer" className="btn-seal">
            Telegram botni ochish
          </a>
          <a href="#katalog" className="btn-ghost">
            Katalogni ko‘rish
          </a>
        </div>

        <Steps />

        {stats && <StatStrip stats={stats} />}
      </div>
    </section>
  );
}

/**
 * Numbered because this genuinely is a sequence — the order is the safety guarantee, and
 * step 3 only exists because step 2 came first.
 */
function Steps() {
  const steps = [
    {
      n: '01',
      title: 'To‘laysiz',
      body: 'Pul kafilda bloklanadi. Sotuvchi unga tegolmaydi.',
    },
    {
      n: '02',
      title: 'Tekshirasiz',
      body: 'Login va parol ochiladi. Akkauntga kirib, hammasi joyidami — ko‘rasiz.',
    },
    {
      n: '03',
      title: 'Tasdiqlaysiz',
      body: 'Hammasi joyida bo‘lsa — pul sotuvchiga o‘tadi. Bo‘lmasa — sizga qaytadi.',
    },
  ];

  return (
    <ol className="mt-12 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3">
      {steps.map((step) => (
        <li key={step.n} className="bg-surface p-5">
          <span className="tnum block text-xs font-bold tracking-[0.14em] text-seal">{step.n}</span>
          <h2 className="mt-2 text-base font-semibold text-ink">{step.title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

function StatStrip({ stats }: { stats: PlatformStats }) {
  const items = [
    { value: stats.active, label: 'Faol e’lon' },
    { value: stats.sold, label: 'Yakunlangan bitim' },
    { value: stats.sellers, label: 'Sotuvchi' },
    { value: `${stats.commission}%`, label: 'Komissiya' },
  ];

  return (
    <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-5">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs uppercase tracking-wider text-faint">{item.label}</dt>
          <dd className="tnum mt-0.5 text-2xl font-bold text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The refund ladder, stated plainly. This is the single most persuasive thing on the page —
 * a marketplace willing to print its own penalty schedule is one that expects to honour it.
 */
export function RefundPolicy({ exampleAmount = 1_000_000 }: { exampleAmount?: number }) {
  const rows = [
    { window: 'Ma’lumot ochilmagan', back: 100, note: 'Muddatsiz' },
    { window: '0–10 daqiqa', back: 100, note: 'Jarimasiz' },
    { window: '10 daqiqa – 2 soat', back: 90, note: '10% jarima' },
    { window: '2 – 24 soat', back: 50, note: '50% jarima' },
    { window: '24 soatdan keyin', back: 0, note: 'Nizo orqali' },
  ];

  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
      <h2 className="text-2xl font-bold text-ink sm:text-3xl">Qaytarish shartlari</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        Vaqt <strong className="font-semibold text-ink">to‘lovdan emas</strong>, siz akkaunt
        ma’lumotlarini ochgan daqiqadan boshlanadi. To‘lov siz uxlab yotganingizda tasdiqlanishi
        mumkin — buning uchun jarima to‘lamaysiz.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-faint">
              <th className="border-b border-line pb-3 pr-4 font-medium">Qachon</th>
              <th className="border-b border-line pb-3 pr-4 font-medium">Qaytariladi</th>
              <th className="border-b border-line pb-3 pr-4 font-medium">
                {formatUzs(exampleAmount)} uchun
              </th>
              <th className="border-b border-line pb-3 font-medium">Izoh</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.window}>
                <td className="border-b border-line py-3 pr-4 font-medium text-ink">
                  {row.window}
                </td>
                <td className="tnum border-b border-line py-3 pr-4">
                  <span
                    className={
                      row.back === 100
                        ? 'font-semibold text-vault'
                        : row.back === 0
                          ? 'font-semibold text-warn'
                          : 'font-semibold text-ink'
                    }
                  >
                    {row.back}%
                  </span>
                </td>
                <td className="tnum border-b border-line py-3 pr-4 text-muted">
                  {formatUzs((exampleAmount * row.back) / 100)}
                </td>
                <td className="border-b border-line py-3 text-muted">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-faint">
        Ko‘rsatilgan foiz — aynan qo‘lingizga tegadigan summa. Platforma komissiyasi qaytarilgan
        puldan emas, faqat jarima qismidan olinadi.
      </p>
    </section>
  );
}
