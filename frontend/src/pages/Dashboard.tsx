import { useAuthStore } from '../store/authStore';
import { authApi } from '../services/authService';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

export const Dashboard = () => {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-header-content">
          <h1>🛠️ Tech Management System</h1>
          <div className="user-info">
            <div className="user-details">
              <strong>{user?.name}</strong>
              <span>{user?.email}</span>
            </div>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="welcome-section">
          <h2>Welcome, {user?.firstName || user?.name}! 👋</h2>
          <p>You have successfully logged in with Microsoft Entra ID.</p>
        </div>

        <div className="user-profile-card">
          <h3>Your Profile</h3>
          <div className="profile-details">
            <div className="profile-item">
              <label>Name:</label>
              <span>{user?.name}</span>
            </div>
            <div className="profile-item">
              <label>Email:</label>
              <span>{user?.email}</span>
            </div>
            {user?.jobTitle && (
              <div className="profile-item">
                <label>Job Title:</label>
                <span>{user.jobTitle}</span>
              </div>
            )}
            {user?.department && (
              <div className="profile-item">
                <label>Department:</label>
                <span>{user.department}</span>
              </div>
            )}
            <div className="profile-item">
              <label>Groups:</label>
              <span>{user?.groups?.length || 0} group(s)</span>
            </div>
          </div>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <h3>📦 Inventory</h3>
            <p>Manage equipment and assets</p>
            <button disabled>Coming Soon</button>
          </div>

          <div className="feature-card">
            <h3>🛒 Purchase Orders</h3>
            <p>Create and track purchase orders</p>
            <button disabled>Coming Soon</button>
          </div>

          <div className="feature-card">
            <h3>🔧 Maintenance</h3>
            <p>Submit and manage maintenance requests</p>
            <button disabled>Coming Soon</button>
          </div>

          <div className="feature-card">
            <h3>👥 Users</h3>
            <p>Manage users and permissions</p>
            <button disabled>Coming Soon</button>
          </div>

          <div className="feature-card">
            <h3>📊 Reports</h3>
            <p>View and export reports</p>
            <button disabled>Coming Soon</button>
          </div>

          <div className="feature-card">
            <h3>⚙️ Settings</h3>
            <p>Configure system settings</p>
            <button disabled>Coming Soon</button>
          </div>
        </div>
      </main>
    </div>
  );
};
