---
category: Logo
---
The BoromTech wordmark, the logo (Brand Guidelines v1.0), as outlined artwork.

- `tone="light"` (Warm Ivory) on `night`; `tone="navy"` (Deep Navy, the default) on `ivory`, `paper`, `sunken` and `soft`; `tone="ink"` for single-colour print. Never orange, never live text in another font.
- Keep at least its cap height (the height of the B) clear on every side. No shadow, no stretching.
- `height` is the cap height; the width is 8.1 times it. Minimum 10px tall (80px wide).

```jsx
<nav style={{ background: 'var(--night)', display: 'flex', alignItems: 'center', padding: '20px 36px' }}>
  <Wordmark tone="light" height={20} style={{ marginRight: 'auto' }} />
</nav>
```
