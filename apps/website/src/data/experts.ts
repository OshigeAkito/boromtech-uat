// The expert areas shown in the Experts carousel, in the order set by the team.
// Titles and chips stay in English in every language; descriptions and labels live in i18n (experts.desc.<id>).
// experience starts empty for every card: fill in real years and projects only, never invented ones. While both
// are empty, the back of the card shows experts.pending instead.

export type Expert = {
  id: string
  icon: string // file name in src/icons/experts/, without the extension
  title: string
  chips: string[]
  experience: { years: string | null; projects: string[] }
  hidden?: boolean // true keeps the card out of the carousel for now; delete the flag to show it again
}

const empty = () => ({ years: null, projects: [] })

export const experts: Expert[] = [
  { id: 'database', icon: 'icon-database', title: 'Database', chips: ['MySQL', 'PostgreSQL', 'SQL Server', 'Oracle', 'MongoDB'], experience: empty() },
  { id: 'software-ai', icon: 'icon-software-ai', title: 'Software Development with AI', chips: ['LLM Integration', 'RAG/Chatbot', 'AI Automation', 'Prompt Engineering', 'AI-assisted Coding'], experience: empty() },
  { id: 'automation', icon: 'icon-automation', title: 'Automation', chips: ['Workflow Automation', 'RPA', 'Power Automate', 'n8n / Zapier', 'API Integration'], experience: empty() },
  { id: 'software', icon: 'icon-software', title: 'Software Development', chips: ['Requirements', 'Web Application', 'API Integration', 'Maintenance', 'Agile/Scrum'], experience: empty() },
  { id: 'frontend', icon: 'icon-frontend', title: 'Frontend & UX', chips: ['React', 'Angular', 'Vue.js', 'TypeScript', 'Figma'], experience: empty() },
  { id: 'backend', icon: 'icon-backend', title: 'Backend', chips: ['Node.js', 'Python', 'PHP/Laravel', 'Java', '.NET'], experience: empty() },
  { id: 'mobile', icon: 'icon-mobile', title: 'Mobile App', chips: ['iOS', 'Android', 'Flutter', 'React Native', 'App Store / Play Store'], experience: empty(), hidden: true },
  { id: 'bi', icon: 'icon-bi', title: 'Business Intelligence (BI)', chips: ['Power BI', 'Tableau', 'SQL', 'ETL/Data Pipeline', 'Dashboard'], experience: empty() },
  { id: 'cloud', icon: 'icon-cloud', title: 'Cloud & DevOps', chips: ['AWS/Azure', 'Docker', 'CI/CD', 'Monitoring', 'Backup'], experience: empty() },
  { id: 'network', icon: 'icon-network', title: 'Network & On-premises', chips: ['Windows/Linux Server', 'LAN/Wi-Fi', 'Firewall', 'Switch/Router', 'VPN'], experience: empty() },
  { id: 'qa', icon: 'icon-qa', title: 'QA & Testing', chips: ['Test Plan', 'Manual Testing', 'Automated Testing', 'Performance Testing', 'UAT'], experience: empty() },
  { id: 'architecture', icon: 'icon-architecture', title: 'Architecture & Documentation', chips: ['System Architecture', 'API Documentation', 'Technical Writing', 'Handover', 'Diagrams'], experience: empty() },
]
