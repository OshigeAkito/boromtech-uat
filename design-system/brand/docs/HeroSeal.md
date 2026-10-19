---
category: Logo
---
The brand's signature picture: the seal huge and cropped by the right edge of a night hero, exactly as on boromtech.co.

- Put it first inside a container with `position: relative`, `overflow: hidden` and `background: var(--night)`; give the copy after it `position: relative` so it stacks above.
- Defaults match the website: 1.24 × the container height, centred 88% across and 55% down. Keep the headline left of the ring.
- Use it on heroes, business card fronts, social posts and slide covers. Never crop from the left, never more than one seal per view.

```jsx
<section style={{ position: 'relative', overflow: 'hidden', background: 'var(--night)', color: 'var(--on-dark)', padding: '120px 5vw' }}>
  <HeroSeal />
  <h1 style={{ position: 'relative', font: '800 64px/1.12 var(--font-display)', letterSpacing: '-0.025em' }}>AI can build it.<br />Who will run it?</h1>
</section>
```
