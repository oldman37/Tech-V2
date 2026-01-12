import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    entraId: string;
    email: string;
    name: string;
    roles: string[];
    groups: string[];
  };
}

export interface JWTPayload {
  id: string;
  entraId: string;
  email: string;
  name: string;
  roles: string[];
  groups: string[];
}

// Authenticate middleware - validates JWT token
export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'No token provided' 
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as JWTPayload;

    req.user = {
      id: decoded.id,
      entraId: decoded.entraId,
      email: decoded.email,
      name: decoded.name,
      roles: decoded.roles || [],
      groups: decoded.groups || [],
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token expired',
      });
    }
    
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid token',
    });
  }
};

// Require admin role - checks if user has admin privileges
export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const adminGroupId = process.env.ENTRA_ADMIN_GROUP_ID;
  const hasAdminRole = req.user.roles.includes('Admin');
  const isInAdminGroup = adminGroupId && req.user.groups.includes(adminGroupId);

  if (!hasAdminRole && !isInAdminGroup) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required',
    });
  }

  next();
};

// Check if user belongs to specific Entra ID group
export const requireGroup = (groupId: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!req.user.groups.includes(groupId)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    }

    next();
  };
};

// Optional authentication - doesn't fail if no token provided
export const optionalAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as JWTPayload;

    req.user = {
      id: decoded.id,
      entraId: decoded.entraId,
      email: decoded.email,
      name: decoded.name,
      roles: decoded.roles || [],
      groups: decoded.groups || [],
    };
  } catch (error) {
    // Silently fail for optional auth
  }

  next();
};
