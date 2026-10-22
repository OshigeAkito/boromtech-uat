---
category: Logo
---
The BoromTech ring (the seal): the brand's supporting graphic and app icon, a thick ring that is never filled, broken, stretched or recoloured outside its four tones. For a big cropped ring use `HeroSeal`.

- `<Seal tone="orange" />` on `night` and `paper`; `tone="rust"` on `soft` and `ivory` (orange is 2.7:1 and 2.8:1 there); `tone="ink"` on an orange fill; `tone="light"` on dark photographs.
- Keep 15% of its size clear on every side. Minimum 16px; below 24px it draws the heavier small-size ring by itself.
- Never over text. One seal per view: don't place a `Seal` or `Lockup` next to a `HeroSeal`.

```jsx
<Seal tone="orange" size={48} title="BoromTech" />
```
