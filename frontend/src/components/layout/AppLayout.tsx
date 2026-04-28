// c:\Tech-V2\frontend\src\components\layout\AppLayout.tsx

import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authApi } from '../../services/authService';
import './AppLayout.css';

interface NavItem {
  label: string;
  icon: string;
  path?: string;
  disabled?: boolean;
  adminOnly?: boolean;
  requireTech?: boolean;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', icon: '🏠', path: '/dashboard' },
      { label: 'My Equipment', icon: '💻', path: '/my-equipment' },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { label: 'Inventory', icon: '📦', path: '/inventory', requireTech: true },
      { label: 'Equipment Search', icon: '🔍', path: '/equipment-search', requireTech: true },
      { label: 'Disposed Equipment', icon: '🗑️', path: '/disposed-equipment', requireTech: true },
      { label: 'Reference Data', icon: '🏷️', path: '/reference-data', adminOnly: true },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Purchase Orders', icon: '📋', path: '/purchase-orders' },
      { label: 'Work Orders', icon: '🔧', path: '/work-orders' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'Users', icon: '👥', path: '/users', adminOnly: true },
      { label: 'Locations & Supervisors', icon: '🏢', path: '/supervisors', adminOnly: true },
      { label: 'Admin Settings', icon: '⚙️', path: '/admin/settings', adminOnly: true },
    ],
  },
  {
    items: [
      { label: 'Reports', icon: '📊', disabled: true, requireTech: true },
    ],
  },
];

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.roles?.includes('ADMIN');
  const hasTechAccess = isAdmin || (user?.permLevels?.TECHNOLOGY ?? 0) >= 2;

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  return (
    <div className="app-shell">
      {/* Top Header */}
      <header className="shell-header">
        <div className="shell-header-left">
          <span className="shell-logo">⚙️</span>
          <span className="shell-title">Tech Management System</span>
        </div>
        <div className="shell-header-right">
          <div className="shell-user-info">
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
          <button onClick={handleLogout} className="btn btn-ghost btn-sm">
            Logout
          </button>
        </div>
      </header>

      <div className="shell-body">
        {/* Sidebar */}
        <nav className="shell-sidebar">
          {NAV_SECTIONS.map((section, si) => {
            const visibleItems = section.items.filter((item) =>
              (!item.adminOnly || isAdmin) && (!item.requireTech || hasTechAccess)
            );
            if (visibleItems.length === 0) return null;
            return (
              <div key={si} className="nav-section">
                {section.title && (
                  <div className="nav-section-title">{section.title}</div>
                )}
                {visibleItems.map((item) => {
                  const isActive = item.path ? location.pathname === item.path : false;
                  if (item.disabled) {
                    return (
                      <div key={item.label} className="nav-item nav-item--disabled">
                        <span className="nav-icon">{item.icon}</span>
                        <span>{item.label}</span>
                        <span className="nav-soon">Soon</span>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={item.label}
                      className={`nav-item${isActive ? ' nav-item--active' : ''}`}
                      onClick={() => item.path && navigate(item.path)}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Main Content */}
        <main className="shell-content">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
