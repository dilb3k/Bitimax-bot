import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Bitimax — pulingiz siz tasdiqlamaguningizcha sotuvchiga o‘tmaydi';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Link preview card. Rendered at build/request time by next/og rather than shipped as a static
 * PNG, so the headline and the mark stay in step with the site instead of drifting into a
 * stale image nobody remembers to re-export.
 *
 * Only inline styles work here — next/og supports a small subset of CSS and no stylesheet.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0F1216',
          // satori (next/og) implements only a subset of CSS: `radial-gradient(... at x y ...)`
          // fails to parse and takes the whole image down, so the wash is a linear gradient.
          backgroundImage:
            'linear-gradient(135deg, rgba(216,156,61,0.22) 0%, rgba(15,18,22,0) 48%)',
          padding: '68px 76px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 64 64">
            <defs>
              <linearGradient id="s" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
                <stop stopColor="#D9A250" />
                <stop offset="0.55" stopColor="#B0761E" />
                <stop offset="1" stopColor="#7C4F10" />
              </linearGradient>
            </defs>
            <rect x="2" y="2" width="60" height="60" rx="19" fill="url(#s)" />
            <path d="M19 15h14.5a7.5 7.5 0 0 1 0 15H19V15Z" fill="#FFFCF6" />
            <path d="M19 34h18a7.5 7.5 0 0 1 0 15H19V34Z" fill="#FFFCF6" />
            <rect x="19" y="30" width="24" height="4" fill="url(#s)" />
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#EEEBE6', fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>
              Bitimax
            </span>
            <span style={{ color: '#9E9890', fontSize: 20 }}>kafil bilan savdo</span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            color: '#EEEBE6',
            fontSize: 62,
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: -1.6,
            maxWidth: 940,
          }}
        >
          Pulingiz siz tasdiqlamaguningizcha sotuvchiga o‘tmaydi.
        </div>

        <div style={{ display: 'flex', gap: 40, alignItems: 'center' }}>
          {[
            ['01', 'To‘laysiz'],
            ['02', 'Tekshirasiz'],
            ['03', 'Tasdiqlaysiz'],
          ].map(([n, label]) => (
            <div key={n} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ color: '#D89C3D', fontSize: 20, fontWeight: 700 }}>{n}</span>
              <span style={{ color: '#EEEBE6', fontSize: 28, fontWeight: 600 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
