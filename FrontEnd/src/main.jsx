import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { SiteSettingsProvider } from './hooks/useSiteSettings.js'

import './styles/root.css'
import './styles/responsive.css'
import './styles/design-system.css'
import './styles/customer-v2.css'
import './styles/customer-v3.css'
import './styles/admin/workspace-v2.css'
import './styles/admin/operations-v3.css'
import './styles/motion-system.css'
import './styles/mobile-app.css'
import './styles/responsive-content.css'


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SiteSettingsProvider>
          <App />
        </SiteSettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
