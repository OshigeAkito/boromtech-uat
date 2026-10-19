# BoromTech CI

The corporate identity, mirrored from the BoromTech CI design system (https://claude.ai/artifact/YBDPtWLgzHbvzj9j5d6WAv, private), which also holds the live previews of the logo, business card, social posts and Audit Report header. Files here: `tokens.json` (the source), `tokens.css` (generated from it), `logos/` (the files the Logos group refers to) and `fonts/` (the display cut the website ships). `node scripts/build-brand-logos.mjs` rebuilds `logos/` from the font and the website's favicon.

BoromTech audits, rescues and maintains software that other people built. The identity has to look like the firm you call when something expensive is broken: calm, exact, accountable. One thick orange ring on deep night blue does most of the work. Everything else stays quiet so the ring and the headline carry the page.

> AI can build it. Who will run it?
> เอไอใครๆก็ทำได้ แต่ใครจะดูแล

This system formalises what boromtech.co already does. Its palette names and values are the website's own (`apps/website/src/styles/site.css`), so a colour named here is the colour the site paints. The product design system (the job board) builds on these foundations.

## Voice

- Write like the engineer who opened up the system and found the problem. Name the thing, the number and the date: "No automated backup policy. Effective RPO is 41 days", not "your backups may need attention".
- Say what you will do and what it costs before you do it: "Every case starts with a 5-business-day audit and a fixed-price quote before any work begins."
- Short sentences. No exclamation marks, no emoji, no hype words ("revolutionary", "seamless", "cutting-edge").
- Thai first for Thai clients. English for code, IDs and product names. Keep the English loanwords Thai readers already use: ออดิต, ซิสเต็ม, โปรเจกต์. Don't translate them into formal Thai.
- The four site languages are Thai, English, Vietnamese and Simplified Chinese. Translate the meaning of a headline, not its words: "Ai cũng làm được với AI. Nhưng ai sẽ duy trì?" and "AI 人人都会做，但谁来维护？" keep the question.
- Buttons say what happens next: "Book a system audit", "นัดออดิตซิสเต็ม", "Send us this case". Never "Submit" or "Learn more".
- Document names stay in English in every language: Audit Report, Weekly Update, Warranty. IDs follow `BT-<type>-<number>`: `BT-A-0412` for an audit, `BT-W-0412` for a warranty.

## The seal

The seal is the company icon: a thick orange ring, `seal-r` 400 and `seal-stroke` 150 in a `seal-box` of 1000. Use the files in **Logos** (`logos/`); never redraw it. The full rules for clear space, sizes and grounds are in the **The seal** section.

- On `night`, the seal is `orange`. On `paper`, the seal is `orange`. On `soft`, the seal is `rust`. On an `orange` fill, the seal is `ink`.
- At 16 to 23px, use `seal-small-orange.svg` (the favicon's heavier ring). From 24px up, use the standard seal.
- The website hero shows the seal huge and cropped by the right edge: 124% of the viewport height, centred 88% across and 55% down. That crop is the brand's signature picture. Use it on heroes, business card fronts, social posts and slide covers. The right edge does the cropping (the top and bottom may graze the ring); never crop from the left, and never cut away more than half the ring.

## Colour

Night and orange are the identity. Spend orange on the seal, the one primary button and a handful of accents per view. Large areas are `night`, `paper` or `soft`; never a large orange field behind text.

| Ground | Text | Secondary text | Seal | Orange as text |
| --- | --- | --- | --- | --- |
| `night` | `on-dark` 13.9:1 | `on-dark-soft` 8.2:1 | `orange` 5.0:1 | `orange` 5.0:1 |
| `night-2` | `on-dark` 12.3:1 | `on-dark-soft` 7.2:1 | `orange` 4.4:1 | 24px and up only |
| `paper` | `ink` 17.2:1 | `muted` 6.3:1 | `orange` 3.2:1 | `rust` 5.4:1 |
| `soft` | `ink` 14.6:1 | `muted` 5.3:1 | `rust` 4.6:1 | `rust` 4.6:1 |
| `orange` fill | `ink` 5.4:1 | none | `ink` | none |

- `orange` text on `paper` is 3.2:1 and fails for body text. Use `rust` for links and emphasis on light grounds.
- `orange` on `soft` is 2.7:1. It fails even as a graphic. Put the seal on `soft` in `rust`.
- White or `on-dark` text on `orange` is 2.8:1. Text on an orange fill is always `ink`.
- `rust` on `night` is 2.9:1. On dark grounds orange itself is the accent.
- Status colours `good`, `warn` and `bad` are for light grounds and always sit beside a word ("Critical 2", "Done"). On night use `status-good`, `status-warn` and `status-bad`, whose night values pass at 6.2:1 or better. In reports, high severity is `rust`, between `bad` and `warn`.
- For theme-aware UI, use the role tokens (`surface`, `surface-2`, `text`, `text-soft`, `seal`, `accent-text`, `hairline`, `focus`). They resolve to the palette in both themes.

## Type

- **Bricolage Grotesque ExtraBold** (`display`) sets Latin headlines and the wordmark. It is the 96pt static cut the website ships, included under `fonts/`. Google Fonts' variable Bricolage at `opsz` 96 draws a narrower, different wordmark, so load this file rather than the Google one.
- **IBM Plex Sans Thai** (`text`) sets everything else in Thai and Latin, at 400, 600 and 700.
- Thai headlines use `hero-th` and `title-th`: Plex Sans Thai Bold, the same size as the Latin style, line height 1.3 to 1.45, tracking 0. Never apply the Latin display's negative tracking to Thai; stacked vowels and tone marks collide.
- Chinese falls through the stack to Noto Sans SC, then PingFang SC and Microsoft YaHei. Use `hero-zh` leading (1.25) and tracking 0.
- Vietnamese: Plex Sans Thai has no Vietnamese subset, so diacritics like ư, ơ and ạ would fall back mid-word. Set `:lang(vi)` text in `text-vi` (IBM Plex Sans first). The display cut is Latin only, so Vietnamese headlines also need Bricolage's latin-ext and vietnamese subsets of the same ExtraBold cut.
- IBM Plex Mono (`mono`) is for document IDs and code only (`id` style).
- Uppercase `label` eyebrows are for Latin text only, at 0.08em tracking.
- Load the hosted faces from Google Fonts:
  `https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600;700&family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@500&family=Noto+Sans+SC:wght@400;700&display=swap`

## Layout, shape and depth

- Corners are square (`radius-none`) on buttons, cards, sheets and images. The seal is the only curve in the identity. `radius-pill` is for status pills and progress meters only.
- No shadows and no gradients. Depth comes from grounds: `night` against `paper`, `paper` against `sunken`.
- Hairlines (`line` on paper, `line-night` on night) separate document rows and header rules. They are decorative; a control still needs a fill or a word.
- Page margins `space-m` to `space-margin`, column gap `space-m` to `space-gap`, chapter padding 96px to `space-section`. The website lays these out fluidly with `clamp()`.
- Headlines sit left-aligned with `text-wrap: balance`. Nothing is centred except an icon inside its tile.
- Focus is a 3px `focus` outline with a 3px offset.

## Motion

- Ease out with `cubic-bezier(.2, .7, .2, 1)`; move between states with `cubic-bezier(.7, 0, .2, 1)`.
- Hover and press changes take 120 to 160ms. A pressed button scales to .97.
- The seal may turn or drift slowly in a hero. It never pulses, bounces, glows or changes thickness. Honour `prefers-reduced-motion` by showing it still.

## Imagery

Documentary photographs with warm, low light: Bangkok infrastructure (the elevated expressway over Borommaratchachonnani Road) and restoration benches with old circuit boards, tweezers and a magnifier. They show real places and real repair work. No stock handshakes, no glowing brains, no blue code rain. Captions sit under the picture in `small` and `muted`.

## Iconography

The seal is the only icon in the identity. Product UI uses a single-weight outline set at 1.5px stroke drawn in `currentColor`; none is bundled here yet. Never draw icons in orange outside the seal.

## Applications

The **Applications** group shows the business card (90 × 55 mm), square social posts in Thai and English, and the Audit Report header. Copy their measurements; they use only tokens and the Logos files.
