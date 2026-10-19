import sitemap from '@astrojs/sitemap'
import { defineConfig, fontProviders } from 'astro/config'
import thaiLoanwords from './integrations/thai-loanwords.mjs'

export default defineConfig({
  site: 'https://boromtech.co',
  i18n: {
    locales: ['th', 'en', 'vi', 'zh'],
    defaultLocale: 'th',
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({ i18n: { defaultLocale: 'th', locales: { th: 'th', en: 'en', vi: 'vi', zh: 'zh-Hans' } } }),
    thaiLoanwords(),
  ],
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
      subsets: ['latin', 'latin-ext', 'vietnamese'],
      fallbacks: [],
    },
    {
      // IBM Plex Sans Thai has no Vietnamese subset; its Latin is IBM Plex Sans, so Vietnamese pages use that.
      provider: fontProviders.fontsource(),
      name: 'IBM Plex Sans',
      cssVariable: '--font-text-vi',
      weights: [400, 600, 700],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext', 'vietnamese'],
      fallbacks: ['sans-serif'],
    },
  ],
})
