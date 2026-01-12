import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="app">
      <header className="app-header">
        <h1>🛠️ Tech Department Management System</h1>
        <p>Modern full-stack web application - v2.0</p>
      </header>
      
      <main className="app-main">
        <div className="card">
          <h2>Welcome to the modernized application</h2>
          <p>
            This is the beginning of your modernized tech management system.
          </p>
          <button onClick={() => setCount((count) => count + 1)}>
            count is {count}
          </button>
          <p className="info">
            Click "count" to test React state management
          </p>
        </div>

        <div className="features">
          <h3>Planned Features:</h3>
          <ul>
            <li>✅ Microsoft Entra ID Authentication</li>
            <li>✅ Inventory Management</li>
            <li>✅ Equipment Tracking</li>
            <li>✅ Purchase Order System</li>
            <li>✅ Maintenance Requests</li>
            <li>✅ User Management</li>
            <li>✅ Reporting & Analytics</li>
          </ul>
        </div>
      </main>

      <footer className="app-footer">
        <p>Backend API: <code>http://localhost:3000</code></p>
        <p>Frontend: <code>http://localhost:5173</code></p>
      </footer>
    </div>
  )
}

export default App
