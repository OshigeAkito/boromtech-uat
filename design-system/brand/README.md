# BoromTech CI

The corporate identity, following **BoromTech Brand Guidelines, version 1.0 (October 2026)**: colour, type, wordmark and ring, layouts and motion, business cards. Where this file and the guidelines disagree, the guidelines win. Files here: `tokens.json` (the source), `tokens.css` (generated from it), `logos/` (the files the Logos group refers to) and `fonts/` (the wordmark cut the website ships). `node scripts/build-brand-logos.mjs` rebuilds `logos/` from the font and the website's favicon. The older BoromTech CI design system (https://claude.ai/artifact/YBDPtWLgzHbvzj9j5d6WAv, private) holds earlier previews of the business card, social posts and Audit Report header.

BoromTech audits, rescues and maintains software that other people built. The identity has to look like the firm you call when something expensive is broken: calm, exact, accountable. The wordmark on Deep Navy, with one thick orange ring cropped into the edge, does most of the work. Everything else stays quiet so the ring and the headline carry the page.

> AI can build it. Who will run it?
> เอไอใครๆก็ทำได้ แต่ใครจะดูแล

The palette values are the website's own (`apps/website/src/styles/site.css`), so a colour named here is the colour the site paints. The product design system (the job board) builds on these foundations.

## Voice

- Write like the engineer who opened up the system and found the problem. Name the thing, the number and the date: "No automated backup policy. Effective RPO is 41 days", not "your backups may need attention".
- Say what you will do and what it costs before you do it: "Every case starts with a 5-business-day audit and a fixed-price quote before any work begins."
- Short sentences. No exclamation marks, no emoji, no hype words ("revolutionary", "seamless", "cutting-edge").
- Thai first for Thai clients. English for code, IDs and product names. Keep the English loanwords Thai readers already use: ออดิต, ซิสเต็ม, โปรเจกต์. Don't translate them into formal Thai.
- The four site languages are Thai, English, Vietnamese and Simplified Chinese. Translate the meaning of a headline, not its words: "Ai cũng làm được với AI. Nhưng ai sẽ duy trì?" and "AI 人人都会做，但谁来维护？" keep the question.
- Buttons say what happens next: "Book a system audit", "นัดออดิตซิสเต็ม", "Send us this case". Never "Submit" or "Learn more".
- Document names stay in English in every language: Audit Report, Weekly Update, Warranty. IDs follow `BT-<type>-<number>`: `BT-A-0412` for an audit, `BT-W-0412` for a warranty.

## Colour

Four brand colours. The token names stay as they were so existing pages keep working; the guideline names are the ones to use in conversation, Canva and print.

| Guideline name | Token | Hex | RGB | Role |
| --- | --- | --- | --- | --- |
| Borom Orange | `orange` | #E56E3F | 229, 110, 63 | Accents, step numbers and actions |
| Deep Navy | `night` | #1E2235 | 30, 34, 53 | The main ground, and headings on light grounds |
| Warm Ivory | `ivory` (`on-dark`) | #F2F1EE | 242, 241, 238 | Text on dark grounds, and the restful light ground |
| Soft Peach | `soft` | #FCE9E1 | 252, 233, 225 | Secondary ground and highlights |

Supporting tokens: `paper` (white, for documents and web UI), `ink` and `muted` (text), `rust` (orange as text on light grounds), `night-2`, `sunken`, `line`, `line-night` and the status colours.

Spend orange only on what the reader must see first: the ring, the one primary action, step numbers. Large areas are navy, ivory, paper or soft; never a large orange field behind text.

| Ground | Headings and wordmark | Text | Secondary text | Orange as text | Ring |
| --- | --- | --- | --- | --- | --- |
| `night` (Deep Navy) | `on-dark` 13.9:1 | `on-dark` 13.9:1 | `on-dark-soft` 8.2:1 | `orange` 5.0:1 | `orange` 5.0:1 |
| `night-2` | `on-dark` 12.3:1 | `on-dark` 12.3:1 | `on-dark-soft` 7.2:1 | 24px and up only | `orange` 4.4:1 |
| `ivory` (Warm Ivory) | `night` 13.9:1 | `night` or `ink` | `muted` 5.5:1 | `rust` 4.8:1 | `orange` cropped (decorative), else `rust` |
| `paper` | `night` 15.7:1 | `ink` 17.2:1 | `muted` 6.3:1 | `rust` 5.4:1 | `orange` 3.2:1 |
| `soft` (Soft Peach) | `night` 13.4:1 | `ink` 14.6:1 | `muted` 5.3:1 | `rust` 4.6:1 | `orange` cropped (decorative), else `rust` |
| `orange` fill | `ink` 5.4:1 | `ink` 5.4:1 | none | none | `ink` |

- Orange on ivory is 2.8:1 and on soft 2.7:1. The guidelines still put the big cropped ring and the business card's hairline in orange on ivory: that is decoration, which carries no information. Orange as text, a small ring standing for the company, or anything a reader has to make out on those grounds is `rust`.
- `orange` text on `paper` is 3.2:1: large headings only, never body text. Use `rust` for links and emphasis on light grounds.
- White or `on-dark` text on `orange` is 2.8:1. Text on an orange fill is always `ink`.
- `rust` on `night` is 2.9:1. On dark grounds orange itself is the accent.
- Status colours `good`, `warn` and `bad` are for light grounds and always sit beside a word ("Critical 2", "Done"). On night use `status-good`, `status-warn` and `status-bad`, whose night values pass at 6.2:1 or better. In reports, high severity is `rust`, between `bad` and `warn`.
- For theme-aware UI, use the role tokens (`surface`, `surface-2`, `heading`, `text`, `text-soft`, `seal`, `accent-text`, `hairline`, `focus`). They resolve to the palette in both themes.

## Type

Two families: **Bricolage Grotesque** for English, the wordmark and headings; **IBM Plex Sans Thai** for Thai. The text stacks put Bricolage first; it has no Thai glyphs, so in mixed copy each script lands in its own face.

| | Bricolage Grotesque (Latin) | IBM Plex Sans Thai (Thai) |
| --- | --- | --- |
| Wordmark | 800 (Ultra Bold), stretch normal, 30px on the web, line height 1, tracking -0.03em | not used |
| Headings | 700 | 600 to 700 |
| Body | 400 to 600 | 400 |

- The wordmark weight, 800, is the 96pt static cut the website ships (`fonts/`). Weights 400 to 700 load from Google Fonts; `tokens.css` asks Google for 400 to 700 only, so the local file stays the only 800 and the wordmark never switches to Google's narrower variable cut.
- In Canva: font "Bricolage Grotesque"; the wordmark is Ultra Bold with letter spacing -30. The guideline names the logo cut "Bricolage Grotesque-7".
- Never condense, stretch or skew either family.
- Thai headlines use `hero-th` and `title-th`: Plex Sans Thai Bold, the same size as the Latin style, line height 1.3 to 1.45, tracking 0. Never apply the Latin display's negative tracking to Thai; stacked vowels and tone marks collide.
- Chinese falls through the stack to Noto Sans SC, then PingFang SC and Microsoft YaHei. Use `hero-zh` leading (1.25) and tracking 0.
- Vietnamese: Bricolage covers Vietnamese at 400 to 700, so `:lang(vi)` text uses `text-vi` (Bricolage, then IBM Plex Sans). Plex Sans Thai has no Vietnamese subset; keep it out of Vietnamese runs.
- IBM Plex Mono (`mono`) is for document IDs and code only (`id` style).
- Uppercase `label` eyebrows are for Latin text only, at 0.08em tracking.
- Load the hosted faces from Google Fonts:
  `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400..700&family=IBM+Plex+Sans+Thai:wght@400;600;700&family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@500&family=Noto+Sans+SC:wght@400;700&display=swap`

## Wordmark and ring

The **wordmark** is the logo: "BoromTech" outlined from Bricolage Grotesque 800. Use the files in **Logos** (`logos/`); never retype it.

- On dark grounds it is Warm Ivory (`wordmark-light.svg`). On light grounds it is Deep Navy (`wordmark-navy.svg`). `wordmark-ink.svg` is for single-colour print only.
- Keep clear space of at least the height of the B on every side.
- No shadow, no stretching, no change of proportion, never orange.

The **ring** is the brand's supporting graphic: a thick orange ring, `seal-r` 400 and `seal-stroke` 150 in a `seal-box` of 1000. Its home is cropped into the edge of the medium, as on the guideline cover and the website hero, and it never sits over text. The full rules for construction, sizes and grounds are in **The seal**.

- The cropped hero ring: 124% of the frame's height, centred 88% across and 55% down, so the right edge crops it (the top and bottom may graze it). Use it on covers, section dividers, the business card's brand side, social posts and the website hero. Never crop from the left and never cut away more than half the ring.
- The whole ring, small, is the app icon and favicon (`app-icon.svg`, `favicon.svg`). At 16 to 23px use `seal-small-orange.svg`; from 24px up, the standard ring.
- On `night` and `paper` the ring is `orange`. On `ivory` and `soft` the big cropped ring may stay orange as decoration; a small ring there is `rust`. On an `orange` fill it is `ink`.
- The lockup (ring before wordmark) is not part of the v1.0 guidelines. The files stay for slots that already use them; new work uses the wordmark alone.

## Layout, shape and depth

- Readable hierarchy and room: a big headline, then clear body text.
- Deep Navy grounds for covers and section dividers. Light grounds (ivory, paper, soft) for diagrams and detailed content. Orange only on what must be seen first.
- Corners are square (`radius-none`) on buttons, cards, sheets and images. The ring is the only curve in the identity. `radius-pill` is for status pills and progress meters only.
- No shadows and no gradients. Depth comes from grounds: `night` against `ivory` or `paper`, `paper` against `sunken`.
- Hairlines (`line` on light grounds, `line-night` on night) separate document rows and header rules. They are decorative; a control still needs a fill or a word.
- Page margins `space-m` to `space-margin`, column gap `space-m` to `space-gap`, chapter padding 96px to `space-section`. The website lays these out fluidly with `clamp()`.
- Headlines sit left-aligned with `text-wrap: balance`. Nothing is centred except an icon inside its tile.
- Focus is a 3px `focus` outline with a 3px offset.

## Motion

- Ease out with `ease-out`, `cubic-bezier(.2, .7, .2, 1)`; move between states with `ease-in-out`, `cubic-bezier(.7, 0, .2, 1)`.
- Hover and press changes take 120 to 160ms (`duration-press`). A pressed button scales to .97.
- The ring may turn or drift slowly in a hero. It never pulses, bounces, glows or changes thickness. Honour `prefers-reduced-motion` by showing it still.

### Presentations

- Content enters with **Rise**, on enter: a gentle reveal.
- Slides that share a layout are joined with **Match & Move**, 0.5s (`duration-slide`).
- The presenter advances the slides; nothing auto-advances. Give Thai text time to be read before the slide changes.

## Imagery

Documentary photographs with warm, low light: Bangkok infrastructure (the elevated expressway over Borommaratchachonnani Road) and restoration benches with old circuit boards, tweezers and a magnifier. They show real places and real repair work. No stock handshakes, no glowing brains, no blue code rain. Captions sit under the picture in `small` and `muted`.

## Iconography

The ring is the only brand icon. Product UI uses a single-weight outline set at 1.5px stroke drawn in `currentColor`; none is bundled here yet. Never draw icons in orange outside the ring.

## Business cards

Executive cards are 90 × 55 mm with two sides: information and brand. The aim is clear information and a brand that is easy to remember.

- **Information side:** a Warm Ivory ground. The wordmark in Deep Navy at the top left. The name in IBM Plex Sans Thai Bold, Deep Navy, with the job title under it in `muted` (Latin in Bricolage). An orange hairline above the footer, then the website domain in Deep Navy.
- **Brand side:** a Deep Navy ground with the cropped orange ring, the wordmark in Warm Ivory.
- Thai names and job titles are used exactly as each person confirmed them.
- The website line uses the current domain, `boromtech-website.vercel.app`.
- Leave room for a phone number and an email address, added later.
- Print: 3 mm bleed on every side, and keep text at least 4 mm inside the trim line.
