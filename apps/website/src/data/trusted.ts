// Clients who trust us, grouped by industry. Only clients with consent: true appear on the live site, and only
// industries with at least one such client get a filter button. With none, the section is not rendered at all;
// the dev server shows these samples so the layout can be reviewed.
// Never add a real company's name or logo here without its written consent.

export type Industry = { id: string; label: string }
export type Client = { id: string; name: string; logo: string; industry: string; consent: boolean }

export const industries: Industry[] = [
  { id: 'retail', label: 'ค้าปลีก' },
  { id: 'finance', label: 'การเงิน' },
  { id: 'logistics', label: 'โลจิสติกส์' },
  { id: 'manufacturing', label: 'การผลิต' },
]

// logo is the SVG's path from the project root; the section inlines it so it takes the text colour.
export const clients: Client[] = [
  { id: 'client-1', name: 'Client Logo 1', logo: '/src/assets/trusted/client-logo-1.svg', industry: 'retail', consent: false },
  { id: 'client-2', name: 'Client Logo 2', logo: '/src/assets/trusted/client-logo-2.svg', industry: 'retail', consent: false },
  { id: 'client-3', name: 'Client Logo 3', logo: '/src/assets/trusted/client-logo-3.svg', industry: 'finance', consent: false },
  { id: 'client-4', name: 'Client Logo 4', logo: '/src/assets/trusted/client-logo-4.svg', industry: 'finance', consent: false },
  { id: 'client-5', name: 'Client Logo 5', logo: '/src/assets/trusted/client-logo-5.svg', industry: 'logistics', consent: false },
  { id: 'client-6', name: 'Client Logo 6', logo: '/src/assets/trusted/client-logo-6.svg', industry: 'logistics', consent: false },
  { id: 'client-7', name: 'Client Logo 7', logo: '/src/assets/trusted/client-logo-7.svg', industry: 'manufacturing', consent: false },
  { id: 'client-8', name: 'Client Logo 8', logo: '/src/assets/trusted/client-logo-8.svg', industry: 'manufacturing', consent: false },
]
