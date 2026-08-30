import type { MetadataRoute } from 'next';
import { BRAND } from '@medsphere/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: BRAND.fullName,
    short_name: BRAND.shortName,
    description: BRAND.tagline,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f6f0',
    theme_color: '#07110f',
    orientation: 'any',
    categories: ['health', 'medical', 'productivity'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
