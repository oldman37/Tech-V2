import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import AccessDenied from '../pages/AccessDenied';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireTech?: boolean;
}

export const ProtectedRoute = ({ children, requireAdmin = false, requireTech = false }: ProtectedRouteProps) => {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Global check: user must belong to at least ALL_STAFF or ALL_STUDENTS (or ADMIN)
  if (user?.hasBaseAccess === false) {
    return <AccessDenied />;
  }

  if (requireAdmin) {
    const isAdmin = user?.roles?.includes('ADMIN');
    
    if (!isAdmin) {
      return <AccessDenied />;
    }
  }

  if (requireTech) {
    const isAdmin = user?.roles?.includes('ADMIN');
    const hasTechAccess = isAdmin || (user?.permLevels?.TECHNOLOGY ?? 0) >= 2;
    if (!hasTechAccess) {
      return <AccessDenied />;
    }
  }

  return <>{children}</>;
};
