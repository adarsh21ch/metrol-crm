import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import '../prototype.css'

/* The boundary is OUTSIDE App on purpose: a throw anywhere in the tree, on
   any screen, lands on a page that says what broke instead of painting the
   window white. */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
