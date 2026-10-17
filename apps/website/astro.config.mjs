import sitemap from '@astrojs/sitemap'
import { defineConfig, fontProviders } from 'astro/config'

export default defineConfig({
  site: 'https://boromtech.co',
  integrations: [sitemap()],
  build: { inlineStylesheets: 'always' },
  image: { responsiveStyles: false },
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'IBM Plex Sans Thai',
      cssVariable: '--font-text',
      weights: [400, 600, 700],
      styles: ['normal'],
      subsets: ['thai', 'latin'],
      fallbacks: ['sans-serif'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Bricolage Grotesque',
      cssVariable: '--font-display',
      weights: [800],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: [],
    },
  ],
})
