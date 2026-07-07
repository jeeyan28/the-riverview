import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'

// BrowserRouter wraps the whole app exactly once, here at the root —
// this is what makes <Routes>/<Route>/<Link>/useNavigate work anywhere
// inside <App />. See Phase 3 notes for what each of those do.
//
// AuthProvider (Phase 11) wraps everything too, not just the /admin/*
// routes — Login.jsx/Register.jsx (public routes) also need to update the
// shared user object on sign-in, and a future public-site profile modal
// would need the same `user` this context exposes for admin pages.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
