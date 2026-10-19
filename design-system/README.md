# BoromTech

BoromTech builds software for clients by splitting each project into small, checkable pieces of work. The brand is precise, warm and plain-spoken: an engineering shop that explains itself in short sentences, in Thai and English.

This is the product system for the job board. It builds on the **BoromTech CI** (https://claude.ai/artifact/YBDPtWLgzHbvzj9j5d6WAv, private; in the repo, `design-system/brand/`), which owns the logo, the palette and the display type. Where the two disagree, the CI wins.

## Brand color

**BoromTech Orange, `#E56E3F`** (`brand`) is the identity. It is a fill color. Use it on primary buttons, active tabs, highlights and illustration blocks, with dark `on-brand` text on top. Never set white text on it (3.2:1) and never use it as text on white (3.2:1). When orange has to be text, use `brand-strong` (5.4:1 on white, 8.0:1 on the dark surface).

**Night** (`night`) is the secondary identity color, a deep blue-ink that gives orange something to push against. Use it for hero bands, footers and the dark half of illustrations, with `night-ink` text and `night-ink-soft` for secondary lines. `night-2` is the second night step for panels that sit on a night band.

`brand-deep` is the pressed and hover state of an orange fill. `on-brand` ink on it is 4.0:1, so it is a passing state, never a resting fill behind body-size text.

Spend orange sparingly. One orange action per view; everything else is ink on surface. A screen full of orange stops meaning "do this next".

## Voice

- Speak like the engineer who did the work. Name the thing, the number and the date: "3 tasks due 31 Oct", not "a few items need attention soon".
- Short sentences. No exclamation marks, no emoji in product UI.
- Bilingual by default. Thai first for customer-facing copy, English for code, IDs and technical terms. Never mix both languages inside one sentence unless it is a product or technical term.
- Buttons say what happens: "Submit for review", "Mark ฿4,500 paid". Not "OK" or "Continue".

## Visual foundations

- **Color.** Semantic tokens with a light and a dark theme; light is the fallback. Each token's note names the surfaces its text is legible on. Status colors (`success`, `warning`, `danger`) mean state only and are never decoration.
- **Type.** Bricolage Grotesque ExtraBold 800 (`display`) for headlines, used once per page. It is the 96pt static cut the website ships, included under `fonts/`; Google Fonts' variable Bricolage draws narrower letters, so don't load it from there. IBM Plex Sans Thai (`sans`) for everything else, because one family covers Thai and Latin with matching weight. IBM Plex Mono (`mono`) for IDs, versions and figures that line up in columns. Plex Sans Thai and Plex Mono load from Google Fonts:
  `https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap`
- **Spacing.** A 4px grid (`space-1` to `space-12`). Lay out groups with `gap`, not margins.
- **Shape.** Corners are square, as in the CI: `radius-sm`, `radius-md` and `radius-lg` are all 0, kept as names so components and their consumers keep working. `radius-pill` is reserved for status pills and avatars, so a pill always reads as a state.
- **Depth.** Borders, not shadows. Cards sit on `surface-raised` with a `line` border. A shadow is allowed only on floating layers (menus, dialogs).
- **Focus.** Every interactive element shows `focus-ring` as a 2px ring with a 2px gap in the surface color.

## Iconography

The logo is the CI's seal, a thick orange ring, with its wordmark and lockup. Use the files in the CI's Logos group (`design-system/brand/logos/` in the repo) and follow its seal and lockup rules; never redraw the seal or set the wordmark in live type.

- Pick the file by ground: `lockup-on-paper.svg` on the light surfaces, `lockup-on-night.svg` on night and on the dark theme's surfaces, `lockup-on-soft.svg` on brand-soft, `lockup-ink.svg` for single-colour print.
- Use the lockup where the seal is not already in view: the app header, sign-in, emails and documents. Use the wordmark alone (`wordmark-ink.svg`, `wordmark-light.svg`) next to a large seal. One seal per view.
- Keep 1 stroke-width of the seal clear around the lockup. Minimum size is 24px tall.
- At 16 to 23px (favicons, tab icons) use `seal-small-orange.svg` or `favicon.svg`.

For icons, use a single-weight outline set at 1.5px stroke drawn with `currentColor` so it follows text color.

## Components

The job board components live in `components/bundle.js` as `window.BoromTech` and expect React 18 on the page: `TaskCard`, `StatusPill`, `Button`, `StarRating` and `TierBadge`. Task states are defined once in `BoromTech.STATUS`, so the pill, the card and any list filter agree on what "Awaiting review" means.

## Not decided yet

Icon set, illustration style, and form components (input, select, textarea) are still open.
