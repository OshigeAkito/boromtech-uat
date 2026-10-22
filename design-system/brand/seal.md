# The seal

The seal, called the ring in Brand Guidelines v1.0, is a ring and nothing else: no letters inside, no gap, no second ring. It stands for the one thing BoromTech promises, a system that is closed, looked after and accounted for. Since v1.0 the wordmark is the logo and the ring is the brand's supporting graphic: at its best cropped into the edge of the medium, never over text. The whole ring stays the app icon and favicon.

## Construction

- Standard seal: centre-line radius `seal-r` 400, stroke `seal-stroke` 150, in a `seal-box` of 1000. The outer edge sits at 475, so the file keeps a 25-unit margin.
- The stroke width is the unit **s**. Everything around the mark is measured in s.
- Small-size seal: radius `seal-small-r` 19 and stroke `seal-small-stroke` 9 in a box of 64. Its stroke is 47% of the radius instead of 37.5%, so the ring stays open and solid at favicon sizes. It is the website's `favicon.svg` ring.

## Clear space

- Keep 1s clear on every side of the seal: no text, edge or other graphic inside it. At 24px tall that is about 4px; on a 1000-unit seal it is 150 units.
- Around the lockup, keep 1s of the lockup's seal on every side.
- The hero crop is the one exception: there the page edge cuts through the seal on purpose. It still never sits over text.

## The wordmark

- Keep at least the height of the B (its cap height) clear on every side.
- Deep Navy on light grounds (`wordmark-navy.svg`), Warm Ivory on dark (`wordmark-light.svg`), `wordmark-ink.svg` for single-colour print.

## Minimum size

| Asset | Screen | Print |
| --- | --- | --- |
| Standard seal | 24px | 6mm |
| Small-size seal | 16px to 23px | not for print |
| Lockup | 24px tall (183px wide) | 6mm tall (46mm wide) |
| Wordmark | 80px wide | 15mm wide |

## The lockup

The lockup is not part of Brand Guidelines v1.0, whose logo is the wordmark alone. The files stay for slots that already use them; new work uses the wordmark. The lockup sets the seal before the wordmark. The seal's outer diameter is 1.25 times the wordmark's cap height, centred on the cap height, with a 1s gap. The wordmark is outlined from the same Bricolage Grotesque ExtraBold file as the site nav, at -0.03em tracking with the browser's own kerning, so the logo files match the live nav exactly.

- Use the wordmark alone in the website nav, on business cards and anywhere the big cropped seal is already in view. Two seals in one view compete.
- Never rebuild the lockup in live type or move the seal to the right of the wordmark.

## Files

| File | Use on |
| --- | --- |
| `seal-orange.svg` | `night`, `night-2`, `paper`; cropped big on `ivory` and `soft` as decoration |
| `seal-rust.svg` | a small ring on `soft` or `ivory` |
| `seal-ink.svg` | an `orange` fill; single-colour print, emboss and stamps |
| `seal-light.svg` | dark photographs where orange would be lost |
| `seal-small-orange.svg` | 16 to 23px on any ground orange passes on |
| `favicon.svg` | browser tabs: the small seal on a `night` square |
| `app-icon.svg` | app and touch icons at 1024px: the favicon scaled ×16. The platform applies its own corner mask; the artwork stays square |
| `wordmark-navy.svg` | the logo on light grounds: `ivory`, `paper`, `soft`, `sunken` |
| `wordmark-light.svg` | the logo on `night` and `night-2` |
| `wordmark-ink.svg` | single-colour print |
| `lockup-on-night.svg`, `lockup-on-paper.svg`, `lockup-on-soft.svg`, `lockup-ink.svg` | outside v1.0, kept for existing slots: the lockup on each ground (navy wordmark on light grounds); `lockup-ink` for single-colour print |

Every file is a single-ink SVG with its colour written in (an `<img>` cannot recolour it). Pick the file by ground; never recolour one with a filter.
