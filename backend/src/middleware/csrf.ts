/**
 * CSRF Protection Middleware
 * 
 * Implements Cross-Site Request Forgery protection using Double Submit Cookie pattern.
 * 
 * How it works:
 * 1. Server generates a random CSRF token on initial request
 * 2. Token is sent to client both as:
 *    - A cookie (HttpOnly, SameSite)
 *    - A response header for the client to read
 * 3. Client includes token in custom header for subsequent requests
 * 4. Server validates that cookie token matches header token
 * 
 * This prevents CSRF attacks because an attacker's site cannot:
 * - Read the token from the cookie (HttpOnly)
 * - Set custom headers on cross-origin requests
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Cookie and header names
const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_HEADER_NAME = 'x-xsrf-token';

// Methods that require CSRF protection
const PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Generate a cryptographically secure random token
 */
function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Middleware to generate and set CSRF token
 * Call this on routes where you want to provide a CSRF token to the client
 */
export const provideCsrfToken = (req: Request, res: Response, next: NextFunction) => {
  // Check if token already exists
  let token = req.cookies[CSRF_COOKIE_NAME];
  
  if (!token) {
    // Generate new token
    token = generateCsrfToken();
    
    // Set token as HttpOnly cookie
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }
  
  // Also send token in response header so client can read it
  res.setHeader('X-CSRF-Token', token);
  
  next();
};

/**
 * Middleware to validate CSRF token
 * Apply this to routes that modify data (POST, PUT, PATCH, DELETE)
 */
export const validateCsrfToken = (req: Request, res: Response, next: NextFunction) => {
  // Skip validation for non-protected methods (GET, HEAD, OPTIONS)
  if (!PROTECTED_METHODS.includes(req.method)) {
    return next();
  }
  
  // Get token from cookie
  const cookieToken = req.cookies[CSRF_COOKIE_NAME];
  
  // Get token from header (try lowercase and uppercase variants)
  const headerToken = req.headers[CSRF_HEADER_NAME] || 
                     req.headers[CSRF_HEADER_NAME.toUpperCase()] ||
                     req.headers['x-csrf-token'] ||
                     req.headers['X-CSRF-Token'];
  
  // Validate that both tokens exist
  if (!cookieToken) {
    return res.status(403).json({ 
      error: 'CSRF token missing',
      message: 'CSRF cookie not found. Please refresh and try again.' 
    });
  }
  
  if (!headerToken) {
    return res.status(403).json({ 
      error: 'CSRF token missing',
      message: 'CSRF token not provided in request header.' 
    });
  }
  
  // Validate that tokens match (timing-safe comparison)
  const tokensMatch = crypto.timingSafeEqual(
    Buffer.from(cookieToken),
    Buffer.from(headerToken as string)
  );
  
  if (!tokensMatch) {
    return res.status(403).json({ 
      error: 'CSRF token invalid',
      message: 'CSRF token mismatch. Possible CSRF attack detected.' 
    });
  }
  
  // Tokens match, proceed with request
  next();
};

/**
 * Endpoint to get a fresh CSRF token
 * Frontend can call this to obtain a token before making protected requests
 */
export const getCsrfToken = (req: Request, res: Response) => {
  const token = req.cookies[CSRF_COOKIE_NAME];
  
  if (!token) {
    return res.status(400).json({ 
      error: 'No CSRF token available',
      message: 'CSRF token cookie not found' 
    });
  }
  
  res.json({ csrfToken: token });
};
