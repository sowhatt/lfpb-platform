import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LFPB Officiels',
    short_name: 'LFPB Officiels',
    description: 'Assistant terrain vocal et hors ligne pour les officiels de la LFPB',
    start_url: '/',
    display: 'standalone',
    background_color: '#071f36',
    theme_color: '#071f36',
    lang: 'fr',
    icons: [
      { src: '/icons/lfpb-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/lfpb-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/lfpb-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
