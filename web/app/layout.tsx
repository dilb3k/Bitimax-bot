import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Manrope } from 'next/font/google';
import './globals.css';

// next/font downloads and self-hosts these at build time, so there is no runtime request to
// a font CDN — no third-party connection, no flash of fallback text.
const display = Bricolage_Grotesque({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const body = Manrope({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://bitimax.uz';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'Bitimax — Kafil bilan xavfsiz raqamli bozor',
    template: '%s · Bitimax',
  },
  description:
    'Pulingiz siz tasdiqlamaguningizcha sotuvchiga o‘tmaydi. Bitimax — P2P escrow (kafil) ' +
    'tizimida ishlaydigan raqamli akkauntlar bozori.',
  keywords: ['escrow', 'kafil', 'garant', 'akkaunt sotish', 'Telegram akkaunt', 'Bitimax'],
  openGraph: {
    title: 'Bitimax — Kafil bilan xavfsiz raqamli bozor',
    description: 'Pulingiz siz tasdiqlamaguningizcha sotuvchiga o‘tmaydi.',
    type: 'website',
    locale: 'uz_UZ',
    siteName: 'Bitimax',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF8F4' },
    { media: '(prefers-color-scheme: dark)', color: '#0F1216' },
  ],
};

/**
 * Applies the stored theme before first paint. Without this the page renders in the default
 * theme for a frame and then snaps — the classic dark-mode flash.
 */
const noFlashTheme = `
(function(){try{
  var t = localStorage.getItem('bitimax-theme');
  var dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
