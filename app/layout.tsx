import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Short Exporter | AI Animation to MP4',
  description: 'Preview and export AI generated HTML animations as vertical MP4 videos, locally in your browser.',
  applicationName: 'Short Exporter',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Short Exporter' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0f1218' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
