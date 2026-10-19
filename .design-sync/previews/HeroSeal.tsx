import { HeroSeal, Wordmark } from '@boromtech/brand'

const hero = { position: 'relative' as const, overflow: 'hidden', background: 'var(--night)', color: 'var(--on-dark)', height: 360, padding: '24px 36px', fontFamily: 'var(--font-text)' }

export const Hero = () => (
  <section style={hero}>
    <HeroSeal />
    <Wordmark tone="light" height={20} style={{ position: 'relative' }} />
    <div style={{ position: 'relative', display: 'grid', gap: 20, justifyItems: 'start', marginTop: 56, maxWidth: 460 }}>
      <h1 style={{ margin: 0, font: '800 48px/1.12 var(--font-display)', letterSpacing: '-0.025em' }}>AI can build it.<br />Who will run it?</h1>
      <span style={{ background: 'var(--orange)', color: 'var(--ink)', font: '600 15px/1 var(--font-text)', padding: '16px 24px' }}>Book a system audit</span>
    </div>
  </section>
)

export const HeroThai = () => (
  <section style={hero} lang="th">
    <HeroSeal />
    <Wordmark tone="light" height={20} style={{ position: 'relative' }} />
    <div style={{ position: 'relative', display: 'grid', gap: 20, justifyItems: 'start', marginTop: 48, maxWidth: 460 }}>
      <h1 style={{ margin: 0, font: '700 48px/1.3 var(--font-text)', letterSpacing: 0 }}>เอไอใครๆก็ทำได้<br />แต่ใครจะดูแล</h1>
      <span style={{ background: 'var(--orange)', color: 'var(--ink)', font: '600 15px/1 var(--font-text)', padding: '16px 24px' }}>นัดออดิตซิสเต็ม</span>
    </div>
  </section>
)
