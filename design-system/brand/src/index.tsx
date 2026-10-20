import type { CSSProperties } from 'react'
import { CAP, GLYPHS, WORDMARK_WIDTH } from './wordmark'

// Each ink falls back to the brand hex, so the marks render right even without tokens.css.
const INK = {
  orange: 'var(--orange, #e56e3f)',
  rust: 'var(--rust, #b4471d)',
  ink: 'var(--ink, #1a1b22)',
  navy: 'var(--night, #1e2235)',
  light: 'var(--on-dark, #f2f1ee)',
  night: 'var(--night, #1e2235)',
} as const

export type SealTone = 'orange' | 'rust' | 'ink' | 'light'
export type WordmarkTone = 'navy' | 'light' | 'ink'
export type LockupGround = 'night' | 'paper' | 'soft' | 'mono'

const label = (title?: string) => (title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })

export interface SealProps {
  /** Ring colour. `orange` on night and paper, `rust` on soft, `ink` on an orange fill, `light` on dark photos. */
  tone?: SealTone
  /** Rendered size in px. Below 24px the heavier small-size ring is drawn automatically. Minimum 16. */
  size?: number
  /** Accessible name. Leave unset when the seal is decorative. */
  title?: string
  className?: string
  style?: CSSProperties
}

/**
 * The BoromTech seal: a thick orange ring, the company icon. Standard ring r 400, stroke 150 in a 1000 box;
 * under 24px it switches to the favicon's heavier ring (r 19, stroke 9 in 64).
 */
export function Seal({ tone = 'orange', size = 48, title, className, style }: SealProps) {
  const small = size < 24
  return (
    <svg
      {...label(title)}
      className={className}
      width={size}
      height={size}
      viewBox={small ? '0 0 64 64' : '0 0 1000 1000'}
      style={{ display: 'block', flex: 'none', ...style }}
    >
      {small ? (
        <circle cx={32} cy={32} r={19} fill="none" strokeWidth={9} style={{ stroke: INK[tone] }} />
      ) : (
        <circle cx={500} cy={500} r={400} fill="none" strokeWidth={150} style={{ stroke: INK[tone] }} />
      )}
    </svg>
  )
}

const wordmarkPaths = (fill: string, x = 0, baseline = CAP) => (
  <g transform={`translate(${x} ${baseline}) scale(1 -1)`} style={{ fill }}>
    {GLYPHS.map(([dx, d]) => (
      <path key={dx} transform={`translate(${dx} 0)`} d={d} />
    ))}
  </g>
)

export interface WordmarkProps {
  /** `navy` (Deep Navy) on ivory, paper, sunken and soft; `light` (Warm Ivory) on night; `ink` for single-colour print. Never orange. */
  tone?: WordmarkTone
  /** Cap height in px (the SVG's height). The width follows at 8.1 times the height. Minimum 10 (80px wide). */
  height?: number
  /** Accessible name. Defaults to "BoromTech". */
  title?: string
  className?: string
  style?: CSSProperties
}

/**
 * The BoromTech wordmark, the primary logo: outlined from Bricolage Grotesque ExtraBold at -0.03em with the site's kerning.
 * Keep clear space of at least its cap height (the height of the B) on every side.
 */
export function Wordmark({ tone = 'navy', height = 24, title = 'BoromTech', className, style }: WordmarkProps) {
  return (
    <svg
      {...label(title)}
      className={className}
      height={height}
      width={(height * WORDMARK_WIDTH) / CAP}
      viewBox={`0 0 ${WORDMARK_WIDTH} ${CAP}`}
      style={{ display: 'block', flex: 'none', ...style }}
    >
      {wordmarkPaths(INK[tone])}
    </svg>
  )
}

// Lockup geometry: the seal's outer diameter is 1.25 x the cap height, centred on it, with a 1s gap.
const D = CAP * 1.25
const K = D / 950
const LOCKUP_WIDTH = D + 150 * K + WORDMARK_WIDTH
const LOCKUP_INKS: Record<LockupGround, readonly [string, string]> = {
  night: [INK.orange, INK.light],
  paper: [INK.orange, INK.navy],
  soft: [INK.rust, INK.navy],
  mono: [INK.ink, INK.ink],
}

export interface LockupProps {
  /** The ground it sits on, which picks the inks: `night` (orange + light), `paper` (orange + navy), `soft` (rust + navy), `mono` (all ink, single-colour print). It does not paint a background. */
  ground?: LockupGround
  /** Height in px; the width is 7.64 times the height. Minimum 24. */
  height?: number
  /** Accessible name. Defaults to "BoromTech". */
  title?: string
  className?: string
  style?: CSSProperties
}

/**
 * The seal set before the wordmark. Not part of Brand Guidelines v1.0, whose logo is the wordmark alone; kept for
 * small square-ish slots (email signatures, partner slides) where the seal is not already on the page.
 */
export function Lockup({ ground = 'paper', height = 32, title = 'BoromTech', className, style }: LockupProps) {
  const [seal, word] = LOCKUP_INKS[ground]
  return (
    <svg
      {...label(title)}
      className={className}
      height={height}
      width={(height * LOCKUP_WIDTH) / D}
      viewBox={`0 0 ${LOCKUP_WIDTH} ${D}`}
      style={{ display: 'block', flex: 'none', ...style }}
    >
      <circle cx={D / 2} cy={D / 2} r={400 * K} fill="none" strokeWidth={150 * K} style={{ stroke: seal }} />
      {wordmarkPaths(word, D + 150 * K, D / 2 + CAP / 2)}
    </svg>
  )
}

export interface AppIconProps {
  /** Rendered size in px (square). */
  size?: number
  /** Preview the platform's rounded mask (22.5% corners). The exported artwork itself stays square. */
  masked?: boolean
  /** Accessible name. Leave unset when decorative. */
  title?: string
  className?: string
  style?: CSSProperties
}

/** The app icon and favicon: the small-size seal on a night square (ring r 19, stroke 9 in a 64 box). */
export function AppIcon({ size = 64, masked = false, title, className, style }: AppIconProps) {
  return (
    <svg
      {...label(title)}
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ display: 'block', flex: 'none', borderRadius: masked ? '22.5%' : 0, ...style }}
    >
      <rect width={64} height={64} style={{ fill: INK.night }} />
      <circle cx={32} cy={32} r={19} fill="none" strokeWidth={9} style={{ stroke: INK.orange }} />
    </svg>
  )
}

export interface HeroSealProps {
  /** Ring colour; `orange` on a night hero. */
  tone?: SealTone
  /** Seal diameter as a multiple of the container's height. The website uses 1.24. */
  scale?: number
  /** Centre, as a fraction of the container's width. The website uses 0.88, so the right edge crops it. */
  x?: number
  /** Centre, as a fraction of the container's height. The website uses 0.55. */
  y?: number
  className?: string
  style?: CSSProperties
}

/**
 * The brand's signature picture: the ring huge and cropped by the right edge of a navy cover or hero. It never sits over text. Place it as the
 * first child of a container with `position: relative; overflow: hidden` and a night background; it is decorative.
 */
export function HeroSeal({ tone = 'orange', scale = 1.24, x = 0.88, y = 0.55, className, style }: HeroSealProps) {
  return (
    <svg
      aria-hidden
      className={className}
      viewBox="0 0 1000 1000"
      style={{
        position: 'absolute',
        height: `${scale * 100}%`,
        width: 'auto',
        aspectRatio: '1',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        ...style,
      }}
    >
      <circle cx={500} cy={500} r={400} fill="none" strokeWidth={150} style={{ stroke: INK[tone] }} />
    </svg>
  )
}
