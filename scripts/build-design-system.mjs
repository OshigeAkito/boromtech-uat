import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'

const ds = new URL('../design-system/', import.meta.url)
const tokens = JSON.parse(readFileSync(new URL('tokens.json', ds), 'utf8'))

const [first, ...others] = tokens.color.themes.map((t) => t.id)
const colorValue = (token, theme) => {
  const v = typeof token.value === 'string' ? token.value : (token.value[theme] ?? token.value[first])
  return v.startsWith('{') ? `var(--${v.slice(1, -1)})` : v
}
const colors = (theme) => tokens.color.tokens.map((t) => `  --${t.name}: ${colorValue(t, theme)};`).join('\n')
const lengths = ['spacing', 'radius'].flatMap((family) => tokens[family].tokens.map((t) => `  --${t.name}: ${t.value};`))
const families = Object.entries(tokens.type.families).map(([key, stack]) => `  --font-${key}: ${stack};`)

const css = [
  `/* ${tokens.name} — generated from tokens.json by scripts/build-design-system.mjs */`,
  `:root, [data-theme="${first}"] {\n${colors(first)}\n${lengths.join('\n')}\n${families.join('\n')}\n}`,
  ...others.map((id) => `@media (prefers-color-scheme: ${id}) {\n  :root:not([data-theme="${first}"]) {\n${colors(id).replaceAll('\n', '\n  ').replace(/^/, '  ')}\n    color-scheme: ${id};\n  }\n}`),
  ...others.map((id) => `[data-theme="${id}"] {\n${colors(id)}\n  color-scheme: ${id};\n}`),
].join('\n\n')
writeFileSync(new URL('tokens.css', ds), css + '\n')

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

const names = ['TaskCard', 'StatusPill', 'Button', 'StarRating', 'TierBadge']
await build({
  entryPoints: [new URL('components/src/index.tsx', ds).pathname],
  outfile: new URL('components/bundle.js', ds).pathname,
  bundle: true,
  format: 'iife',
  globalName: '__BoromTech',
  jsx: 'automatic',
  target: 'es2018',
  plugins: [reactGlobal],
  banner: { js: `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: 'BoromTech', components: names.map((name) => ({ name })) })} */` },
  footer: { js: 'window.BoromTech = Object.assign(window.BoromTech || {}, __BoromTech);' },
  logLevel: 'warning',
})
console.log('built tokens.css and components/bundle.js')
