// Builds @boromtech/brand: tokens.css from tokens.json, then dist/ (ESM + .d.ts) from src/.
// Run from anywhere: node design-system/brand/build.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const dir = new URL('./', import.meta.url).pathname
const t = JSON.parse(readFileSync(`${dir}tokens.json`, 'utf8'))
const [first, second] = t.color.themes.map((x) => x.id)
const value = (k, theme) => {
  const v = typeof k.value === 'string' ? k.value : (k.value[theme] ?? k.value[first])
  return v.startsWith('{') ? `var(--${v.slice(1, -1)})` : v
}
const all = t.color.tokens.map((k) => `  --${k.name}: ${value(k, first)};`).join('\n')
const themed = t.color.tokens
  .filter((k) => typeof k.value !== 'string' && k.value[second] && k.value[second] !== k.value[first])
  .map((k) => `  --${k.name}: ${value(k, second)};`)
  .join('\n')
const lengths = ['spacing', 'radius'].flatMap((f) => t[f].tokens.map((k) => `  --${k.name}: ${k.value};`)).join('\n')
const families = Object.entries(t.type.families).map(([k, s]) => `  --font-${k}: ${s};`).join('\n')

writeFileSync(`${dir}tokens.css`, `/* ${t.name} — generated from tokens.json by build.mjs */
@import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600;700&family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@500&family=Noto+Sans+SC:wght@400;700&display=swap");

@font-face { font-family: "Bricolage Grotesque"; src: url("fonts/BricolageGrotesque-ExtraBold-latin.woff2") format("woff2"); font-weight: 800; font-display: swap; }

:root, [data-theme="${first}"] {
${all}
}

[data-theme="${second}"] {
${themed}
  color-scheme: dark;
}

:root {
${lengths}
${families}
}
`)

await build({
  entryPoints: [`${dir}src/index.tsx`],
  outfile: `${dir}dist/index.js`,
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  target: 'es2020',
  logLevel: 'warning',
})
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
execFileSync(process.execPath, [tsc, '-p', `${dir}tsconfig.json`], { stdio: 'inherit' })
console.log('built @boromtech/brand')
