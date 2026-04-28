import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import App from './App.tsx'
import { queryClient } from './lib/queryClient'
import './styles/global.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {/* DevTools only in development */}
      <ReactQueryDevtools 
        initialIsOpen={false} 
        buttonPosition="bottom-right"
      />
    </QueryClientProvider>
  </React.StrictMode>,
)
