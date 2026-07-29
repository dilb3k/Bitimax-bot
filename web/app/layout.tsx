import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bitimax - Raqamli Mahsulotlar Bozori',
  description: 'Bitimax — P2P Escrow tizimida ishlovchi raqamli mahsulotlar bozori. Xavfsiz sotib oling va soting.',
  openGraph: {
    title: 'Bitimax - Raqamli Mahsulotlar Bozori',
    description: 'P2P Escrow tizimida ishlovchi raqamli mahsulotlar bozori',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
