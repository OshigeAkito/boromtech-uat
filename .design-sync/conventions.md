# BoromTech CI: how to build with it

BoromTech audits, rescues and maintains software ("AI can build it. Who will run it?"). Designs follow BoromTech Brand Guidelines v1.0 (October 2026) and should look calm, exact and premium: Deep Navy, the wordmark, one orange ring cropped into the edge, square corners, lots of room.

## Setup

No provider or wrapper. Load `styles.css` (tokens, fonts) and the components from `window.BoromTech`: `Seal`, `Wordmark`, `Lockup`, `AppIcon`, `HeroSeal`. The logo is the wordmark (`Wordmark`); the ring (`HeroSeal`, `Seal`) is the supporting graphic. Never draw either yourself; always use these components. `Lockup` is outside v1.0: don't use it in new designs.

## Styling idiom: CSS custom properties

There are no utility classes. Style your own layout with inline styles or CSS that reads these variables:

| Use | Variables |
| --- | --- |
| Brand colours | Borom Orange `--orange` #E56E3F, Deep Navy `--night` #1E2235, Warm Ivory `--ivory` #F2F1EE, Soft Peach `--soft` #FCE9E1 |
| Grounds | `--night` (covers, section dividers, hero, footer), `--night-2`, `--ivory` (slides, diagrams, card info side), `--paper` (documents), `--sunken` (wells, pills), `--soft` (secondary ground, highlights) |
| Text | headings `--night` on light grounds (`--heading` in themed UI), body `--ink`, `--muted` secondary; `--on-dark` (Warm Ivory) on night, `--on-dark-soft` secondary |
| Accent | `--orange` (seal, primary button fill, accents on night), `--orange-deep` (hover), `--rust` (orange as text on light grounds) |
| Status | `--good`, `--warn`, `--bad` on light grounds, always next to a word |
| Lines | `--line` hairlines on paper, `--line-night` on night |
| Type | `--font-display` (Latin headings, Bricolage Grotesque 700, letter-spacing -0.025em), `--font-text` (Bricolage 400-600 for Latin body; Thai falls through to IBM Plex Sans Thai: headings 600-700, body 400), `--font-mono` (IDs like BT-A-0412) |
| Motion | `--ease-out`, `--ease-in-out`, `--duration-press` 140ms, `--duration-slide` 500ms (Match & Move) |
| Space, shape | `--space-m` 16, `--space-gap` 28, `--space-margin` 36, `--space-l` 48, `--space-section` 180; `--radius-none` 0, `--radius-pill` 999px |

Rules the agent must keep:
- Spend orange only on what must be seen first: the ring, the one primary action, step numbers.
- Text on an `--orange` fill is `--ink`, never white. Orange text on light grounds is too faint: use `--rust`.
- The wordmark is `tone="light"` on `--night` and `tone="navy"` on light grounds. Keep the height of the B clear around it.
- A small `Seal` on `--soft` or `--ivory` is `tone="rust"`; on `--night` and `--paper` it is `orange`. The big cropped `HeroSeal` may stay orange on any ground, but never over text.
- Covers and section dividers on `--night`; diagrams and detailed content on `--ivory` or `--paper`.
- Corners are square everywhere. `--radius-pill` only for status pills and progress meters.
- No gradients, glows or shadows. One seal per view: a `HeroSeal` hero gets a `Wordmark` nav, not a `Lockup`.
- Thai headlines use `--font-text` at weight 700, line-height 1.3, letter-spacing 0. Latin headlines use `--font-display` 700 at line-height 1.12; only the wordmark is 800. Vietnamese text uses `--font-text-vi`.
- Business cards are 90 × 55 mm: information side on `--ivory` (navy wordmark, Thai name in Plex Sans Thai Bold, title in `--muted`, orange hairline, `boromtech-website.vercel.app`), brand side on `--night` with the cropped ring. 3 mm bleed, text 4 mm inside the trim.
- Buttons say what happens: "Book a system audit", "นัดออดิตซิสเต็ม".

## Where the truth lives

`styles.css` and its imports hold every variable value. `guidelines/README.md` is the brand book (voice, colour contrast table, type, wordmark and ring, layout and motion, business cards); `guidelines/seal.md` covers clear space and sizes; `guidelines/rules.md` lists do and don't. Each component's `.prompt.md` has its props and examples.

## Example

```jsx
const { HeroSeal, Wordmark } = window.BoromTech
<section style={{ position: 'relative', overflow: 'hidden', background: 'var(--night)', color: 'var(--on-dark)', padding: '24px 36px 96px', fontFamily: 'var(--font-text)' }}>
  <HeroSeal />
  <Wordmark tone="light" height={20} style={{ position: 'relative' }} />
  <div style={{ position: 'relative', display: 'grid', gap: 28, justifyItems: 'start', marginTop: 96, maxWidth: 560 }}>
    <h1 style={{ margin: 0, font: '700 64px/1.12 var(--font-display)', letterSpacing: '-0.025em' }}>AI can build it.<br />Who will run it?</h1>
    <a style={{ background: 'var(--orange)', color: 'var(--ink)', font: '600 18px/1 var(--font-text)', padding: '19px 28px', textDecoration: 'none' }}>Book a system audit</a>
  </div>
</section>
```
