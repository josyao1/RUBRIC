/**
 * main — React application entry point
 *
 * Mounts the root App component inside React StrictMode and BrowserRouter.
 * This is the bootstrap file referenced by the Vite dev server and build.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
