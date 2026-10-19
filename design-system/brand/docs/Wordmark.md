---
category: Logo
---
The BoromTech wordmark as outlined artwork, for navs and any view that already shows the big cropped seal.

- `tone="light"` on `night`, `tone="ink"` on `paper`, `sunken` and `soft`. Never orange, never live text in another font.
- `height` is the cap height; the width is 8.1 times it. Minimum 10px tall (80px wide).

```jsx
<nav style={{ background: 'var(--night)', display: 'flex', alignItems: 'center', padding: '20px 36px' }}>
  <Wordmark tone="light" height={20} style={{ marginRight: 'auto' }} />
</nav>
```
