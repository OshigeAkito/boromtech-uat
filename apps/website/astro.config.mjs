import { writeFile } from 'node:fs/promises'
import sitemap from '@astrojs/sitemap'
import { defineConfig, fontProviders } from 'astro/config'
import thaiLoanwords from './integrations/thai-loanwords.mjs'

// MEDIA_ORIGIN (e.g. https://media.boromtech.com) moves built images to R2 bucket bt-public, which
// scripts/upload-media.mjs fills, and keeps them out of the Worker's assets. Unset, images ship with the site.
// JS, fonts and anything else always keep root-relative URLs on the site's own origin (the '/' fallback).
const media = process.env.MEDIA_ORIGIN
const mediaTypes = ['jpg', 'png', 'webp', 'avif'] // keep in step with scripts/upload-media.mjs
const mediaInR2 = {
  name: 'media-in-r2',
  hooks: {
    'astro:build:done': ({ dir }) =>
      writeFile(new URL('.assetsignore', dir), mediaTypes.map((ext) => `_astro/*.${ext}\n`).join('')),
  },
}

export default defineConfig({
  site: 'https://boromtech.com',
  i18n: {
    locales: ['th', 'en', 'vi', 'zh'],
    defaultLocale: 'th',
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({ i18n: { defaultLocale: 'th', locales: { th: 'th', en: 'en', vi: 'vi', zh: 'zh-Hans' } } }),
    thaiLoanwords(),
    ...(media ? [mediaInR2] : []),
  ],
  build: {
    inlineStylesheets: 'always',
    assetsPrefix: media ? { fallback: '/', ...Object.fromEntries(mediaTypes.map((ext) => [ext, media])) } : undefined,
  },
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
      // Latin letters in the hero copy. No Vietnamese subset, so Vietnamese pages keep their own fonts there.
      provider: fontProviders.fontsource(),
      name: 'Outfit',
      cssVariable: '--font-hero',
      weights: [400, 600, 700],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
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
