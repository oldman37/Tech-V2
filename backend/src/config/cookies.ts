import { CookieOptions } from 'express';

/**
 * Get cookie configuration based on environment and cookie type
 * Follows security best practices from OWASP and NIST guidelines
 * 
 * @param cookieType - Type of cookie: 'access' or 'refresh'
 * @returns CookieOptions configuration object
 */
export const getCookieConfig = (cookieType: 'access' | 'refresh'): CookieOptions => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const baseConfig: CookieOptions = {
    httpOnly: true,  // Prevent JavaScript access (XSS protection)
    secure: !isDevelopment,  // HTTPS only in production
    sameSite: isDevelopment ? 'lax' : (cookieType === 'refresh' ? 'strict' : 'lax'),
  };

  if (cookieType === 'access') {
    return {
      ...baseConfig,
      maxAge: 30 * 60 * 1000, // 30 minutes — matches JWT_EXPIRES_IN
      path: '/api',  // Scope to API routes
    };
  } else {
    return {
      ...baseConfig,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/auth/refresh-token',  // Scope to refresh endpoint only (least privilege)
    };
  }
};
