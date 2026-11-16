import type { MetadataRoute } from 'next';
export const dynamic = 'force-static';
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'Short Exporter', short_name: 'Short Exporter', description: 'Turn AI animation code into vertical videos.', start_url: '/', scope: '/', display: 'standalone', background_color: '#0f1218', theme_color: '#0f1218', icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ] };
}
