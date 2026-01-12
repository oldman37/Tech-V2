import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../services/authService';
import { useAuthStore } from '../store/authStore';
import './Login.css';

export const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const { setUser, setTokens, isAuthenticated } = useAuthStore();

  // Check if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  // Handle OAuth callback
  useEffect(() => {
    const code = searchParams.get('code');
    
    if (code) {
      handleCallback(code);
    }
  }, [searchParams]);

  const handleCallback = async (code: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await authApi.handleCallback(code);
      
      if (response.data.success) {
        // Store tokens and user
        setTokens(response.data.token, response.data.refreshToken);
        setUser(response.data.user);
        
        // Redirect to dashboard
        navigate('/dashboard');
      }
    } catch (err: any) {
      console.error('Callback error:', err);
      setError(err.response?.data?.message || 'Authentication failed. Please try again.');
      
      // Clear code from URL
      navigate('/login', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await authApi.getLoginUrl();
      
      if (response.data.authUrl) {
        // Redirect to Entra ID login
        window.location.href = response.data.authUrl;
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.response?.data?.message || 'Failed to initiate login. Please try again.');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-spinner">
            <div className="spinner"></div>
            <p>Authenticating...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>🛠️ Tech Management System</h1>
          <p>Sign in to continue</p>
        </div>

        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="login-body">
          <button 
            className="microsoft-login-button"
            onClick={handleLogin}
            disabled={loading}
          >
            <svg className="microsoft-icon" viewBox="0 0 21 21">
              <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
              <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
              <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
            </svg>
            Sign in with Microsoft
          </button>

          <p className="login-info">
            Use your organization account to sign in
          </p>
        </div>

        <div className="login-footer">
          <p>Secure authentication powered by Microsoft Entra ID</p>
        </div>
      </div>
    </div>
  );
};
