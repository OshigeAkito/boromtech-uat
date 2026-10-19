# BoromTech CI: how to build with it

BoromTech audits, rescues and maintains software ("AI can build it. Who will run it?"). Designs should look calm, exact and premium: deep night blue, one orange ring, square corners, lots of room.

## Setup

No provider or wrapper. Load `styles.css` (tokens, fonts) and the components from `window.BoromTech`: `Seal`, `Wordmark`, `Lockup`, `AppIcon`, `HeroSeal`. Never draw the logo yourself; always use these components.

## Styling idiom: CSS custom properties

There are no utility classes. Style your own layout with inline styles or CSS that reads these variables:

| Use | Variables |
| --- | --- |
| Grounds | `--night` (hero, footer), `--night-2`, `--paper` (documents), `--sunken` (wells, pills), `--soft` (warm light sections) |
| Text | `--ink` on paper/sunken/soft, `--muted` secondary; `--on-dark` on night, `--on-dark-soft` secondary |
| Accent | `--orange` (seal, primary button fill, accents on night), `--orange-deep` (hover), `--rust` (orange as text on light grounds) |
| Status | `--good`, `--warn`, `--bad` on light grounds, always next to a word |
| Lines | `--line` hairlines on paper, `--line-night` on night |
| Type | `--font-display` (Latin headlines, weight 800, letter-spacing -0.025em), `--font-text` (Thai and Latin body, 400/600/700), `--font-mono` (IDs like BT-A-0412) |
| Space, shape | `--space-m` 16, `--space-gap` 28, `--space-margin` 36, `--space-l` 48, `--space-section` 180; `--radius-none` 0, `--radius-pill` 999px |

Rules the agent must keep:
- Text on an `--orange` fill is `--ink`, never white. Orange text on white is too faint: use `--rust`.
- The seal on `--soft` is `tone="rust"`. On `--night` and `--paper` it is `orange`.
- Corners are square everywhere. `--radius-pill` only for status pills and progress meters.
- No gradients, glows or shadows. One seal per view: a `HeroSeal` hero gets a `Wordmark` nav, not a `Lockup`.
- Thai headlines use `--font-text` at weight 700, line-height 1.3, letter-spacing 0. Latin headlines use `--font-display` 800 at line-height 1.12. Vietnamese text uses `--font-text-vi`.
- Buttons say what happens: "Book a system audit", "นัดออดิตซิสเต็ม".

## Where the truth lives

`styles.css` and its imports hold every variable value. `guidelines/README.md` is the brand book (voice, colour contrast table, type); `guidelines/seal.md` covers clear space and sizes; `guidelines/rules.md` lists do and don't. Each component's `.prompt.md` has its props and examples.

## Example

```jsx
const { HeroSeal, Wordmark } = window.BoromTech
<section style={{ position: 'relative', overflow: 'hidden', background: 'var(--night)', color: 'var(--on-dark)', padding: '24px 36px 96px', fontFamily: 'var(--font-text)' }}>
  <HeroSeal />
  <Wordmark tone="light" height={20} style={{ position: 'relative' }} />
  <div style={{ position: 'relative', display: 'grid', gap: 28, justifyItems: 'start', marginTop: 96, maxWidth: 560 }}>
    <h1 style={{ margin: 0, font: '800 64px/1.12 var(--font-display)', letterSpacing: '-0.025em' }}>AI can build it.<br />Who will run it?</h1>
    <a style={{ background: 'var(--orange)', color: 'var(--ink)', font: '600 18px/1 var(--font-text)', padding: '19px 28px', textDecoration: 'none' }}>Book a system audit</a>
  </div>
</section>
```
