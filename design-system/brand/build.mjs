// Builds @boromtech/brand, the merged BoromTech design system: the CI (this folder) plus the
// job-board components and tokens (../components, ../tokens.json), which the job-board app also
// uses directly. Run from anywhere: node design-system/brand/build.mjs
//
// Outputs:
//   tokens.merged.json  CI tokens + the job-board tokens the CI doesn't define (CI wins on a clash)
//   tokens.css          CSS variables from tokens.merged.json, with the fonts
//   brand.css           tokens.css + the job-board component styles (what Claude Design loads)
//   components.css      the job-board component styles alone, for the design system artifact
//   dist/               ESM bundle + .d.ts, and bundle.iife.js (window.BoromTech) for the artifact
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const dir = new URL('./', import.meta.url).pathname
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
const ci = read(`${dir}tokens.json`)
const product = read(`${dir}../tokens.json`)

// -- merge tokens ------------------------------------------------------------
const names = (list) => new Set(list.map((k) => k.name))
const addMissing = (mine, theirs) => [...mine, ...theirs.filter((k) => !names(mine).has(k.name))]
const merged = {
  ...ci,
  color: { ...ci.color, tokens: addMissing(ci.color.tokens, product.color.tokens) },
  type: { ...ci.type, families: { ...product.type.families, ...ci.type.families, sans: ci.type.families.text } },
  spacing: { tokens: addMissing(ci.spacing.tokens, product.spacing.tokens) },
  radius: { tokens: addMissing(ci.radius.tokens, product.radius.tokens) },
}
writeFileSync(`${dir}tokens.merged.json`, JSON.stringify(merged, null, 2) + '\n')

// Tokens both systems define but the CI holds constant. The job-board components were drawn
// against the product's dark values, so those are scoped back onto the components in dark.
const ciByName = Object.fromEntries(ci.color.tokens.map((k) => [k.name, k]))
const clashes = product.color.tokens.filter((k) => ciByName[k.name] && typeof k.value !== 'string' && k.value.dark)

// -- tokens.css --------------------------------------------------------------
const [first, second] = merged.color.themes.map((x) => x.id)
const value = (k, theme) => {
  const v = typeof k.value === 'string' ? k.value : (k.value[theme] ?? k.value[first])
  return v.startsWith('{') ? `var(--${v.slice(1, -1)})` : v
}
const all = merged.color.tokens.map((k) => `  --${k.name}: ${value(k, first)};`).join('\n')
const themed = merged.color.tokens
  .filter((k) => typeof k.value !== 'string' && k.value[second] && k.value[second] !== k.value[first])
  .map((k) => `  --${k.name}: ${value(k, second)};`)
  .join('\n')
const lengths = ['spacing', 'radius'].flatMap((f) => merged[f].tokens.map((k) => `  --${k.name}: ${k.value};`)).join('\n')
const families = Object.entries(merged.type.families).map(([k, s]) => `  --font-${k}: ${s};`).join('\n')

const tokensCss = `/* ${merged.name} — generated from tokens.json and ../tokens.json by build.mjs */
@import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+SC:wght@400;700&display=swap");

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
`
writeFileSync(`${dir}tokens.css`, tokensCss)

// -- component styles --------------------------------------------------------
// Drop the job-board sheet's page-level body rule: in a merged system it would restyle every page.
const productCss = readFileSync(`${dir}../components/bundle.css`, 'utf8').replace(/^body \{[^}]*\}\n/m, '')
const roots = ['.bt-btn', '.bt-pill', '.bt-task', '.bt-stars', '.bt-tier']
// That body rule also gave the components their font and the card its text colour; set them on
// the components instead (after the sheet, so .bt-btn's font: inherit loses to it).
const ownBase = `
/* Job-board components carry their own font and card text colour (the job-board sheet set them on body). */
:is(${roots.join(', ')}) { font-family: var(--font-sans); }
.bt-task { color: var(--ink); }
`
const darkShim = `
/* Job-board components keep their own dark values for tokens the CI holds constant. */
[data-theme="${second}"] :is(${roots.join(', ')}) {
${clashes.map((k) => `  --${k.name}: ${k.value.dark};`).join('\n')}
}
`
const componentsCss = productCss + ownBase + darkShim
writeFileSync(`${dir}components.css`, componentsCss)
writeFileSync(`${dir}brand.css`, `${tokensCss}\n/* -- job-board components (../components/bundle.css) -- */\n${componentsCss}`)

// -- job-board docs for Claude Design ------------------------------------------
// The job-board READMEs stay the source; these copies only add the picker group.
for (const name of ['Button', 'StatusPill', 'StarRating', 'TierBadge', 'TaskCard']) {
  const body = readFileSync(`${dir}../components/${name}/README.md`, 'utf8').replace(/^# .*\n+/, '')
  mkdirSync(`${dir}docs/job-board`, { recursive: true })
  writeFileSync(`${dir}docs/job-board/${name}.md`, `---\ncategory: Job board\n---\n${body.trimEnd()}\n\n<!-- Generated by build.mjs from ../components/${name}/README.md. Edit that file. -->\n`)
}

// -- JS ----------------------------------------------------------------------
const common = { entryPoints: [`${dir}src/index.tsx`], bundle: true, jsx: 'automatic', target: 'es2020', logLevel: 'warning' }
await build({ ...common, outfile: `${dir}dist/index.js`, format: 'esm', external: ['react', 'react/jsx-runtime'] })

// The artifact page loads React 18 as a global, so the IIFE reads window.React.
const reactGlobal = {
  name: 'react-global',
  setup(b) {
    b.onResolve({ filter: /^react(\/jsx-runtime)?$/ }, (args) => ({ path: args.path, namespace: 'react-global' }))
    b.onLoad({ filter: /.*/, namespace: 'react-global' }, (args) => ({
      contents:
        args.path === 'react'
          ? 'module.exports = window.React'
          : 'var R = window.React; exports.Fragment = R.Fragment; exports.jsx = exports.jsxs = function (t, p, k) { return R.createElement(t, k === undefined ? p : Object.assign({}, p, { key: k })) }',
    }))
  },
}
await build({ ...common, outfile: `${dir}dist/bundle.iife.js`, format: 'iife', globalName: 'BoromTech', plugins: [reactGlobal] })

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
execFileSync(process.execPath, [tsc, '-p', `${dir}tsconfig.json`], { stdio: 'inherit' })
console.log(`built @boromtech/brand (${merged.color.tokens.length} colours; scoped dark values: ${clashes.map((k) => k.name).join(', ')})`)
