---
category: Logo
---
The seal set before the wordmark, for documents, email signatures, business card backs and partner slides.

- Set `ground` to the background it sits on: `night`, `paper`, `soft` or `mono`. It picks the inks; it does not paint the background.
- Minimum 24px tall. Keep clear space equal to the ring's thickness (about 16% of the height) on every side.
- Don't use it in the website nav or beside a `HeroSeal`; use `Wordmark` there.

```jsx
<header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: 20 }}>
  <Lockup ground="paper" height={24} />
  <span>Audit Report · BT-A-0412</span>
</header>
```
