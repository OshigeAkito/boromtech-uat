import type th from './th'

export default {
  meta: {
    title: 'BoromTech · Anyone can build with AI. We keep it running.',
    description:
      'Paid for a project that never worked, or built with AI and no one to maintain it? BoromTech takes over systems big and small. Fixed-price audit, 90-day guarantee.',
    ogImageAlt: 'The unfinished Sathorn Unique Tower among completed buildings in Bangkok',
  },
  nav: {
    label: 'Main menu',
    cases: 'What we fix',
    process: 'Process',
    team: 'Team',
    faq: 'FAQ',
    cta: 'Consult with us',
    language: 'Language',
  },
  hero: {
    cta: 'Consult with us',
    slides: [
      ['Anyone can build it with AI. But is it properly engineered?', 'BoromTech sends experts to audit it.'],
      ['A multi-million project that still doesn’t work', 'BoromTech sends experts to repair it and finish the job.'],
      ['So many apps built. Who looks after them?', 'BoromTech sends experts for regular care.'],
      ['Networking is hard to follow. I need someone to explain it', 'BoromTech sends experts to advise and do the work.'],
      ['Outsourcing one project costs a fortune', 'BoromTech brings the experts together at a fair price.'],
    ],
  },
  iceberg: {
    title: ['What you ', "don't see"],
    aboveLabel: 'What you see',
    above: ['Screens that work', 'Features that passed the demo'],
    belowLabel: 'What someone has to look after',
    below: [
      'Backups that actually restore',
      'Security and patch updates',
      'Monitoring and alerts when it goes down',
      'Documentation the next person can follow',
      'Upgrades before support ends',
      'Someone who picks up the phone at 3 a.m.',
    ],
    closing: 'BoromTech looks after everything below the waterline, so what sits above it works every day.',
    bug: 'Bug',
    fixed: 'Fixed',
  },
  cases: {
    title: 'What we take on',
    intro: 'Pick the symptoms that match your project and see where we step in.',
    photoAlt: 'The unfinished Sathorn Unique Tower standing among completed buildings in Sathorn, Bangkok',
    photoCaption:
      'Sathorn Unique Tower, a vast project abandoned mid-construction in 1997. A lot of expensive software and half-finished projects get left the same way.',
    symptoms: [
      { symptom: 'We paid a lot for a project that still isn’t usable', remedy: 'We operate on the existing structure, fix what is broken and get the system running for real, without tearing it all down and starting over.' },
      { symptom: 'We built it ourselves or with AI, but no one keeps it stable', remedy: 'We clean up the code, close security holes and take on looking after the system so it keeps working in the long run.' },
      { symptom: 'The old vendor walked away, went silent or never delivered in full', remedy: 'We take over from the system that is actually running, compare it against the missing scope and finish the job without waiting on anyone.' },
      { symptom: 'No source code, no documentation, or the developer has left', remedy: 'We recover the code from your servers into a Git repository you own, and write fresh documentation and diagrams for all of it.' },
      { symptom: 'The system crashes, slows down or miscalculates and no one knows why', remedy: 'We set up monitoring, collect logs and trace the root cause until the problem is gone.' },
      { symptom: 'The system is too old or can’t scale to more customers', remedy: 'We plan upgrades and improve it piece by piece, with the system staying online the whole time.' },
      { symptom: 'We need a professional team to look after our systems, big or small', remedy: 'We are the technical team that monitors, updates and fixes things so your business runs with peace of mind.' },
    ],
    verdict: 'Every case starts with a 5-business-day audit and a fixed-price quote before any work begins.',
    verdictPicked: '{n} symptoms · a 5-business-day audit covers everything you picked, with a fixed-price quote before any work begins',
    cta: 'Send us this case',
    emailSubject: 'Booking a system audit',
    emailBody: 'Hello,\n\nOur system has these symptoms:\n{symptoms}\n\nSystem / project name:\nTechnology used (if known):\nPhone:\n',
  },
  process: {
    title: 'From audit to guarantee',
    times: ['5 business days', '2 days', '2–8 weeks', '90 days'],
    notes: [
      'First, we audit the real code, servers and databases and report every risk.',
      'Then a fixed-price quote, itemised line by line.',
      'During the work, fixes ship as small, reviewable tasks, with weekly delivery and updates.',
      'After handover, a 90-day guarantee. If our work has a problem, we fix it at no cost.',
    ],
  },
  audit: {
    title: ['Every layer, ', 'audited'],
    intro: 'Over five business days we open up your system layer by layer, from the screens down to the people who run it.',
    layers: [
      { layer: 'Screens and features', check: 'Does every feature in the contract actually work?' },
      { layer: 'Code', check: 'Does the source match what is running? Can the structure be built on?' },
      { layer: 'Database', check: 'Is the data correct, backed up and genuinely restorable?' },
      { layer: 'Servers and cloud', check: 'Are versions out of support? Who holds the passwords?' },
      { layer: 'Security', check: 'Known vulnerabilities, passwords in code and permissions left wide open.' },
      { layer: 'People and knowledge', check: 'Who knows what, and what nobody has written down yet.' },
    ],
    closing: 'The result is an Audit Report that tells you what is broken, what is at risk and what to fix first.',
  },
  showcase: {
    label: 'What you get',
    tablist: 'Documents you receive',
    note: 'Real examples of the documents you receive, from a real engagement: a distributor’s inventory system.',
    mock: 'Note: all data shown is mock-up, to protect client confidentiality.',
  },
  team: {
    title: ['A team from', 'global consulting'],
    photoCaption: 'Photo: Borommaratchachonnani Road, Bangkok',
    photoAlt: 'Borommaratchachonnani Road, Bangkok, an elevated expressway above heavy traffic',
    points: [
      {
        heading: 'Big-project standards for work of any size',
        body: 'Now that anyone can generate code with AI, what separates projects that survive from projects that fail is who looks after them. Our team comes from global consulting firms and brings their approach to auditing, architecture and high-standard delivery to fixing and running your systems, from small jobs to enterprise scale.',
      },
      {
        heading: 'Rescue expensive projects without runaway bills',
        body: 'We know the pain of paying a large sum and getting a system that doesn’t work. So we never bill open-ended hourly rates. Every task has a fixed price agreed before it starts, itemised line by line in the quote.',
      },
    ],
    cta: 'Talk to the team',
  },
  faq: {
    title: 'Before we start',
    items: [
      {
        q: 'We built a system with AI, or paid for a project that broke. Will you take it on?',
        a: 'Yes. Whether it is AI-generated code that can’t hold up in production or an expensive project a previous vendor left unfinished, we audit it, fix what is broken and keep looking after it so it works for real.',
      },
      {
        q: 'Do you take on both small and large jobs?',
        a: 'Yes, from small jobs to large enterprise systems. We break the work into small tasks sized to the real problem, so you choose the priorities and stay in control of the budget.',
      },
      {
        q: 'We have no source code at all. Can it still be recovered?',
        a: 'In most cases, yes. We recover it from the production servers or the deployed files. If it can’t be recovered, you will know from the Audit Report before paying for any system work.',
      },
      {
        q: 'What does the guarantee cover?',
        a: 'Every task we deliver comes with a 90-day guarantee. If a problem is caused by our work, we fix it at no cost. It excludes new features and anything changed by others afterwards.',
      },
      {
        q: 'How is pricing worked out?',
        a: 'The audit is a fixed price quoted before we start, and it is fully credited if you continue the work with us. After that every task has a clear price and you choose the order. If the scope changes, we always quote again before starting.',
      },
      {
        q: 'Which technologies do you support, and is our data safe?',
        a: 'We work with PHP, Laravel, WordPress, Java, .NET, Node.js, Python, React, Angular and all major databases. We always sign an NDA before starting, and all code is 100% yours.',
      },
    ],
  },
  contact: {
    title: 'Send us your system',
    body: 'Wherever your project is stuck, or if you are looking for a team to take it over, tell us the symptoms in a few lines. We reply within one business day and set a date for the audit.',
    cta: 'Write to us',
    emailSubject: 'Booking a system audit',
    photoAlt: 'An old server rack with its network cables neatly rewired',
  },
  footer: {
    city: 'Bangkok',
    copyright: '© 2026 BoromTech',
    credits: 'Some illustrations made with AI · Photos from Wikimedia Commons:',
    by: 'by',
    video: 'video',
  },
} satisfies typeof th
