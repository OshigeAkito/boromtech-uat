import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@boromtech/design-system/tokens.css'
import '@boromtech/design-system/components/bundle.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
