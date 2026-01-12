import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { msalClient, graphClient, loginScopes } from '../config/entraId';
import jwt from 'jsonwebtoken';

// Initiate login - redirect to Entra ID
export const login = async (req: Request, res: Response) => {
  try {
    const authCodeUrlParameters = {
      scopes: loginScopes.scopes,
      redirectUri: process.env.REDIRECT_URI!,
      prompt: 'select_account',
    };

    const authUrl = await msalClient.getAuthCodeUrl(authCodeUrlParameters);
    res.json({ authUrl });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      message: 'Could not initiate login',
    });
  }
};

// Handle OAuth callback
export const callback = async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Authorization code is required',
    });
  }

  try {
    // Exchange code for tokens
    const tokenRequest = {
      code,
      scopes: loginScopes.scopes,
      redirectUri: process.env.REDIRECT_URI!,
    };

    const response = await msalClient.acquireTokenByCode(tokenRequest);

    if (!response || !response.accessToken) {
      throw new Error('Failed to acquire token');
    }

    // Get user info from Microsoft Graph
    const userInfo = await graphClient
      .api('/me')
      .select('id,displayName,userPrincipalName,mail,givenName,surname,jobTitle,department')
      .header('Authorization', `Bearer ${response.accessToken}`)
      .get();

    // Get user's group memberships
    const groups = await graphClient
      .api('/me/memberOf')
      .select('id,displayName')
      .header('Authorization', `Bearer ${response.accessToken}`)
      .get();

    const groupIds = groups.value.map((g: any) => g.id);

    // Create or update user in database (you'll implement this later)
    // For now, we'll just create a JWT with the user info

    // Create application JWT
    const appToken = jwt.sign(
      {
        id: userInfo.id,
        entraId: userInfo.id,
        email: userInfo.userPrincipalName || userInfo.mail,
        name: userInfo.displayName,
        firstName: userInfo.givenName,
        lastName: userInfo.surname,
        groups: groupIds,
        roles: [], // You'll set this based on group membership
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );

    // Create refresh token
    const refreshToken = jwt.sign(
      {
        id: userInfo.id,
        entraId: userInfo.id,
        type: 'refresh',
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      token: appToken,
      refreshToken,
      user: {
        id: userInfo.id,
        entraId: userInfo.id,
        email: userInfo.userPrincipalName || userInfo.mail,
        name: userInfo.displayName,
        firstName: userInfo.givenName,
        lastName: userInfo.surname,
        jobTitle: userInfo.jobTitle,
        department: userInfo.department,
        groups: groupIds,
      },
    });
  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      message: 'Could not complete authentication',
    });
  }
};

// Refresh access token
export const refreshToken = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Refresh token is required',
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET!) as any;

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    // Create new access token
    const newToken = jwt.sign(
      {
        id: decoded.id,
        entraId: decoded.entraId,
        // You might want to fetch fresh user data here
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );

    res.json({
      success: true,
      token: newToken,
    });
  } catch (error) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid refresh token',
    });
  }
};

// Logout
export const logout = async (req: Request, res: Response) => {
  // In a stateless JWT system, logout is handled client-side
  // You could implement token blacklisting here if needed
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
};

// Get current user info
export const getMe = async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No user found',
    });
  }

  res.json({
    success: true,
    user: req.user,
  });
};

// Sync users from Entra ID
export const syncUsers = async (req: AuthRequest, res: Response) => {
  try {
    // Get all users from Entra ID
    const users = await graphClient
      .api('/users')
      .select('id,displayName,userPrincipalName,mail,givenName,surname,jobTitle,department')
      .top(999)
      .get();

    // Here you would sync these users to your database
    // For now, just return the count

    res.json({
      success: true,
      message: 'Users synced successfully',
      count: users.value.length,
      users: users.value,
    });
  } catch (error) {
    console.error('Sync users error:', error);
    res.status(500).json({
      error: 'Sync failed',
      message: 'Could not sync users from Entra ID',
    });
  }
};
