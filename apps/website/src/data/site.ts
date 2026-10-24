// Language-independent data. Visible copy lives in src/i18n/<locale>.ts.
export const site = {
  name: 'BoromTech',
  email: 'sales@boromtech.com',
}

// Bar widths follow the real number of days; labels and notes are per locale (process.times / process.notes).
export const stages = [
  { key: 'audit', days: 5 },
  { key: 'quote', days: 2 },
  { key: 'restore', days: 30 },
  { key: 'warranty', days: 90 },
]

export const credits = [
  { title: 'Sathorn Unique Tower (II)', by: 'Supanut Arunoprayote', licence: 'CC BY 4.0', href: 'https://commons.wikimedia.org/wiki/File:Sathorn_Unique_Tower_(II).jpg' },
  { title: 'Borommaratchachonnani Road near Lotus', by: 'Ahoerstemeier', licence: 'CC BY-SA 4.0', href: 'https://commons.wikimedia.org/wiki/File:Borommaratchachonnani_Road_near_Lotus.jpg' },
  { title: 'Bangkok Skytrain P1110323', video: true, by: 'Deror Avi', licence: 'CC BY-SA 3.0', href: 'https://commons.wikimedia.org/wiki/File:Bangkok_Skytrain_P1110323.ogv' },
]
