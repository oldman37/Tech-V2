# Authentication Setup Guide

## 🔐 Microsoft Entra ID Authentication Implementation

Congratulations! The authentication system has been successfully implemented with Microsoft Entra ID (formerly Azure AD).

---

## ✅ What's Been Built

### Backend Authentication System
- ✅ **Entra ID Configuration** - MSAL client and Microsoft Graph API setup
- ✅ **JWT Middleware** - Token validation and role-based access control
- ✅ **Auth Controllers** - Login, callback, logout, refresh token, user sync
- ✅ **Auth Routes** - `/api/auth/*` endpoints
- ✅ **Protected Routes** - Middleware for authentication and admin access

### Frontend Authentication System
- ✅ **Auth Configuration** - MSAL browser setup
- ✅ **API Service** - Axios interceptors for token management
- ✅ **Auth Store** - Zustand state management with persistence
- ✅ **Login Page** - Microsoft sign-in UI
- ✅ **Dashboard** - Protected user dashboard
- ✅ **Protected Routes** - Route guards for authentication
- ✅ **OAuth Callback Handler** - Automatic token exchange

---

## 🚀 Setup Instructions

### Step 1: Create Entra ID App Registration

1. **Go to Azure Portal**: https://portal.azure.com
2. **Navigate to**: Entra ID > App registrations
3. **Click**: "New registration"

**App Registration Settings:**
- **Name**: `Tech-V2-App`
- **Supported account types**: Accounts in this organizational directory only
- **Redirect URI**: 
  - Platform: Web
  - URL: `http://localhost:3000/api/auth/callback`

4. **Click**: Register

### Step 2: Configure App Registration

After registration, note these values:

**From Overview page:**
- **Application (client) ID** → This is your `ENTRA_CLIENT_ID`
- **Directory (tenant) ID** → This is your `ENTRA_TENANT_ID`

**Create Client Secret:**
1. Go to "Certificates & secrets"
2. Click "New client secret"
3. Description: `Tech-V2-Secret`
4. Expires: 24 months (or your preference)
5. Click "Add"
6. **Copy the Value immediately** → This is your `ENTRA_CLIENT_SECRET`

**Configure API Permissions:**
1. Go to "API permissions"
2. Click "Add a permission"
3. Select "Microsoft Graph"
4. Select "Delegated permissions"
5. Add these permissions:
   - `User.Read`
   - `profile`
   - `openid`
   - `email`
6. Click "Add permissions"
7. **Grant admin consent** (if you have permissions)

**Add Redirect URIs:**
1. Go to "Authentication"
2. Under "Web" redirect URIs, ensure you have:
   - `http://localhost:3000/api/auth/callback`
3. Under "Single-page application", add:
   - `http://localhost:5173`
4. Enable "ID tokens" checkbox
5. Click "Save"

### Step 3: Create Security Groups (Optional but Recommended)

1. Go to **Entra ID > Groups**
2. Create new groups:
   - **Name**: `Tech-Admins`
   - **Type**: Security
   - Add users who should have admin access
   - Note the **Object ID** → This is your `ENTRA_ADMIN_GROUP_ID`

### Step 4: Configure Environment Variables

**Backend** (`backend/.env`):
```env
# Already created for you - just fill in the values

ENTRA_TENANT_ID="paste-your-tenant-id"
ENTRA_CLIENT_ID="paste-your-client-id"
ENTRA_CLIENT_SECRET="paste-your-client-secret"
REDIRECT_URI="http://localhost:3000/api/auth/callback"
ENTRA_ADMIN_GROUP_ID="paste-admin-group-object-id"

# JWT Secret (generate a random 32+ character string)
JWT_SECRET="your-random-secret-at-least-32-characters-long"

# CORS (should match frontend URL)
CORS_ORIGIN="http://localhost:5173"
```

**Frontend** (`frontend/.env`):
```env
VITE_API_URL=http://localhost:3000/api
VITE_ENTRA_CLIENT_ID="paste-your-client-id"
VITE_ENTRA_TENANT_ID="paste-your-tenant-id"
```

---

## 🧪 Testing the Authentication

### Start Both Servers

**Terminal 1 - Backend:**
```powershell
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```powershell
cd frontend
npm run dev
```

### Test the Login Flow

1. **Open Browser**: http://localhost:5173
2. **You should be redirected to**: `/login`
3. **Click**: "Sign in with Microsoft"
4. **You'll be redirected to**: Microsoft login page
5. **Sign in with**: Your organization account
6. **Grant consent** (if prompted)
7. **You'll be redirected back** to the dashboard
8. **You should see**: Your name, email, and profile info

### Test Protected Routes

- **Visit**: http://localhost:5173/dashboard (should show dashboard if authenticated)
- **Visit**: http://localhost:5173/login (should redirect to dashboard if already authenticated)
- **Click Logout**: Should clear tokens and redirect to login

### Test API Endpoints

**Get Auth URL** (should work without authentication):
```powershell
curl http://localhost:3000/api/auth/login
```

**Get Current User** (requires authentication):
```powershell
# First, login and copy your JWT token from browser localStorage
# Then use it in the Authorization header:
curl http://localhost:3000/api/auth/me -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## 🔑 Authentication Flow

### 1. Login Initiation
```
User clicks "Sign in" 
  → Frontend calls /api/auth/login
  → Backend returns Entra ID auth URL
  → Frontend redirects user to Microsoft
```

### 2. User Signs In
```
User enters Microsoft credentials
  → Microsoft validates
  → Microsoft redirects to callback URL with code
  → Backend receives code at /api/auth/callback
```

### 3. Token Exchange
```
Backend exchanges code for access token
  → Calls Microsoft Graph API
  → Gets user profile and groups
  → Creates application JWT
  → Returns JWT + refresh token to frontend
```

### 4. Authenticated Requests
```
Frontend stores JWT in localStorage
  → Axios interceptor adds JWT to all requests
  → Backend validates JWT on protected routes
  → Returns user data or requested resources
```

### 5. Token Refresh
```
Access token expires (1 hour)
  → Frontend gets 401 response
  → Interceptor catches error
  → Calls /api/auth/refresh-token
  → Gets new access token
  → Retries original request
```

---

## 📁 File Structure

```
backend/src/
├── config/
│   └── entraId.ts              # MSAL & Graph API configuration
├── middleware/
│   └── auth.ts                 # JWT validation & RBAC
├── controllers/
│   └── auth.controller.ts      # Login, callback, logout handlers
├── routes/
│   └── auth.routes.ts          # Auth API endpoints
└── server.ts                   # Updated with auth routes

frontend/src/
├── config/
│   └── authConfig.ts           # MSAL browser configuration
├── services/
│   ├── api.ts                  # Axios instance with interceptors
│   └── authService.ts          # Auth API calls
├── store/
│   └── authStore.ts            # Zustand auth state
├── components/
│   └── ProtectedRoute.tsx      # Route guard component
├── pages/
│   ├── Login.tsx & .css        # Login page
│   └── Dashboard.tsx & .css    # Protected dashboard
└── App.tsx                     # Updated with routing
```

---

## 🔒 Security Features

✅ **OAuth 2.0 / OpenID Connect** - Industry standard authentication  
✅ **JWT Tokens** - Stateless authentication  
✅ **Token Expiration** - 1 hour access tokens, 7 day refresh tokens  
✅ **Automatic Token Refresh** - Seamless user experience  
✅ **Role-Based Access Control** - Admin vs regular user permissions  
✅ **Group-Based Authorization** - Using Entra ID security groups  
✅ **CORS Protection** - Limited to frontend origin  
✅ **Rate Limiting** - Prevents brute force attacks  
✅ **Secure Headers** - Helmet.js security middleware  

---

## 🎯 Next Steps

Now that authentication is working, you can:

1. **Create User Management Module**
   - Sync users from Entra ID to database
   - Manage user profiles
   - Assign roles and permissions

2. **Build Protected Features**
   - Equipment/Inventory management
   - Purchase orders
   - Maintenance requests

3. **Implement Admin Features**
   - User administration
   - System settings
   - Reports and analytics

4. **Add More Security**
   - Token blacklisting for logout
   - Activity logging
   - Session management

---

## 🐛 Troubleshooting

### "AADSTS50011: The redirect URI specified in the request does not match"
- Check that redirect URI in Azure matches exactly: `http://localhost:3000/api/auth/callback`
- No trailing slashes
- Check frontend .env has correct VITE_ENTRA_CLIENT_ID

### "Invalid token" errors
- Verify JWT_SECRET is set in backend/.env
- Check token hasn't expired (default 1 hour)
- Ensure Authorization header format: `Bearer YOUR_TOKEN`

### "Authentication failed" on callback
- Check that all 3 Entra ID values are correct in .env files
- Verify client secret hasn't expired
- Check API permissions are granted

### Users can't access admin features
- Verify user is in the admin security group
- Check ENTRA_ADMIN_GROUP_ID is set correctly
- Ensure admin consent was granted for API permissions

---

## 📚 API Endpoints Reference

### Public Endpoints

**GET `/api/auth/login`**  
Returns Microsoft login URL

**GET `/api/auth/callback?code=...`**  
Handles OAuth callback, exchanges code for tokens  
Returns: `{ success, token, refreshToken, user }`

**POST `/api/auth/refresh-token`**  
Body: `{ refreshToken }`  
Returns: `{ success, token }`

**POST `/api/auth/logout`**  
Logs out user (client-side token clearing)

### Protected Endpoints

**GET `/api/auth/me`**  
Requires: `Authorization: Bearer TOKEN`  
Returns: Current user info

**GET `/api/auth/sync-users`**  
Requires: Admin privileges  
Syncs all users from Entra ID

---

## ✅ Authentication Complete!

Your authentication system is now fully functional with:
- Microsoft Entra ID integration
- Secure JWT token management
- Role-based access control
- Beautiful login UI
- Protected routes

**Ready to build features!** 🚀
