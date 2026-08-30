import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './styles.css';

export const metadata: Metadata = {
  title: 'LFPB Platform',
  description: 'Gestion numérique du football professionnel béninois',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'LFPB Officiels' },
};

export const viewport: Viewport = { themeColor: '#071f36' };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
