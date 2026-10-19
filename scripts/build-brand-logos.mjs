// Usage: node scripts/build-brand-logos.mjs  (from the repo root). Reads the display font in design-system/brand/fonts and writes design-system/brand/logos.
import { readFileSync, writeFileSync } from 'node:fs'
const root = new URL('../', import.meta.url).pathname
const fontPath = `${root}design-system/brand/fonts/BricolageGrotesque-ExtraBold-latin.woff2`
const faviconPath = `${root}apps/website/public/favicon.svg`
const out = `${root}design-system/brand/logos`
const { create } = await import('fontkitten')
const font = create(readFileSync(fontPath))
const C = { orange: '#e56e3f', rust: '#b4471d', ink: '#1a1b22', onDark: '#f2f1ee', night: '#1e2235' }

// The seal exactly as the website draws it: r=400, stroke 150, in a 1000 box.
const seal = (color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><circle cx="500" cy="500" r="400" fill="none" stroke="${color}" stroke-width="150"/></svg>\n`
// The small-size seal: the live favicon's ring (r=19, stroke 9 in 64), heavier for 16-32px.
const sealSmall = (color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="19" fill="none" stroke="${color}" stroke-width="9"/></svg>\n`
// App icon: the favicon scaled x16 to 1024.
const appIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${C.night}"/><circle cx="512" cy="512" r="304" fill="none" stroke="${C.orange}" stroke-width="144"/></svg>\n`

// Wordmark: "BoromTech" outlined from Bricolage Grotesque 96pt ExtraBold, tracking -0.03em (site .wordmark).
const TRACK = -30
const glyphs = font.glyphsForString('BoromTech')
// Pen positions measured in Chrome with the same file, so GPOS kerning (m-T, T-e) matches the site.
const XS = [0, 692, 1304, 1750, 2362, 3272, 3784, 4377, 4948, 5591]
const parts = glyphs.map((g, i) => `<path transform="translate(${XS[i] + i * TRACK} 0)" d="${g.path.toSVG()}"/>`)
const wmWidth = XS[glyphs.length] + (glyphs.length - 1) * TRACK
const CAP = 660
const wordmarkGroup = (color, tx, baseline) => `<g fill="${color}" transform="translate(${tx} ${baseline}) scale(1 -1)">${parts.join('')}</g>`
const wordmark = (color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(wmWidth)} ${CAP}">${wordmarkGroup(color, 0, CAP)}</svg>\n`

// Horizontal lockup: seal outer diameter = 1.25 x cap height, centred on the cap middle,
// gap to the wordmark = one seal stroke (the system's unit "s").
const D = CAP * 1.25, k = D / 950, R = 400 * k, S = 150 * k
const cy = D / 2, baseline = cy + CAP / 2, wx = D + S
const lockup = (sealColor, wordColor) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(wx + wmWidth)} ${D}"><circle cx="${D / 2}" cy="${cy}" r="${R.toFixed(2)}" fill="none" stroke="${sealColor}" stroke-width="${S.toFixed(2)}"/>${wordmarkGroup(wordColor, wx.toFixed(2), baseline)}</svg>\n`

const files = {
  'seal-orange.svg': seal(C.orange),
  'seal-rust.svg': seal(C.rust),
  'seal-ink.svg': seal(C.ink),
  'seal-light.svg': seal(C.onDark),
  'seal-small-orange.svg': sealSmall(C.orange),
  'favicon.svg': readFileSync(faviconPath, 'utf8'),
  'app-icon.svg': appIcon,
  'wordmark-ink.svg': wordmark(C.ink),
  'wordmark-light.svg': wordmark(C.onDark),
  'lockup-on-night.svg': lockup(C.orange, C.onDark),
  'lockup-on-paper.svg': lockup(C.orange, C.ink),
  'lockup-on-soft.svg': lockup(C.rust, C.ink),
  'lockup-ink.svg': lockup(C.ink, C.ink),
}
for (const [n, s] of Object.entries(files)) writeFileSync(`${out}/${n}`, s)
console.log(JSON.stringify({ wmWidth, D, R, S, lockupW: wx + wmWidth, ratio: (wx + wmWidth) / D }))
