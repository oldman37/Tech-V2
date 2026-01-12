# Website Modernization Plan
## From Legacy PHP to Modern Full-Stack Application

**Date:** January 12, 2026  
**Project:** Tech Department Management System Modernization  
**Current Location:** C:\wwwroot

---

## 📊 Executive Summary

This document outlines a comprehensive plan to modernize the existing PHP-based technology management system into a modern, scalable, and maintainable full-stack web application. The current system consists of 138+ PHP files managing inventory, equipment tracking, requisitions, purchase orders, user management, and Active Directory integration.

### Current System Analysis

**Technology Stack (Legacy):**
- **Backend:** PHP (procedural code)
- **Database:** MySQL (with deprecated mysql_* functions)
- **Frontend:** jQuery, Bootstrap 3.x, DataTables
- **Authentication:** On-premises Active Directory (LDAP) via adldap2/adldap2
- **Email:** PHPMailer
- **File Processing:** PHPExcel
- **Additional:** JavaScriptSpellCheck, FancyBox, Moment.js

**Key Features Identified:**
- Active Directory authentication and user management
- Inventory management (add, change, dispose, search)
- Equipment tracking and asset management
- Purchase order system (regular and food requisitions)
- Maintenance order system
- Excel report generation
- Android/mobile device support
- Expense reporting by program
- Room/location assignments
- PDF generation
- File upload functionality
- Email notifications

**Critical Issues:**
- Use of deprecated MySQL extension (mysql_*)
- Procedural code structure (poor maintainability)
- No separation of concerns
- No API architecture
- Limited REST API (only basic ticket system found)
- Outdated frontend libraries
- Security vulnerabilities (session management, SQL injection risks)
- No modern build process
- Monolithic architecture
- Mixed business logic and presentation

---

## 🎯 Modernization Goals

1. **Maintainability:** Clean, modular code with clear separation of concerns
2. **Security:** Modern authentication, input validation, and secure coding practices
3. **Scalability:** Microservices-ready architecture
4. **Performance:** Optimized loading, caching, and database queries
5. **User Experience:** Modern, responsive, accessible interface
6. **Developer Experience:** Hot reload, TypeScript, linting, testing
7. **Mobile-First:** Progressive Web App (PWA) capabilities
8. **API-First:** RESTful API for all operations

---

## 🏗️ Proposed Modern Architecture

### Technology Stack

#### **Frontend**
- **Framework:** React 18+ with TypeScript
- **Build Tool:** Vite
- **State Management:** Zustand or Redux Toolkit
- **UI Library:** Material-UI (MUI) v5 or Tailwind CSS + shadcn/ui
- **Forms:** React Hook Form + Zod validation
- **Data Fetching:** TanStack Query (React Query)
- **Routing:** React Router v6
- **Tables:** TanStack Table (React Table)
- **Date Handling:** date-fns or Day.js
- **Excel Operations:** SheetJS (xlsx)
- **PDF Generation:** react-pdf or jsPDF
- **Charts:** Recharts or Chart.js
- **HTTP Client:** Axios
- **Authentication:** JWT tokens with refresh mechanism

#### **Backend**
- **Runtime:** Node.js 20+ LTS
- **Framework:** Express.js or Fastify
- **Language:** TypeScript
- **ORM:** Prisma or TypeORM
- **Database:** PostgreSQL (migration from MySQL)
- **Authentication:** Passport.js with Microsoft Entra ID (Azure AD) integration
- **Identity Platform:** @azure/msal-node (Microsoft Authentication Library)
- **Authorization:** Microsoft Graph API for user/group management
- **Email:** Nodemailer
- **Validation:** Zod or Joi
- **File Upload:** Multer or Busboy
- **Excel Processing:** exceljs or xlsx
- **PDF Generation:** PDFKit or Puppeteer
- **Logging:** Winston or Pino
- **API Documentation:** Swagger/OpenAPI
- **Rate Limiting:** express-rate-limit
- **Security:** Helmet.js, CORS

#### **Database**
- **Primary:** PostgreSQL 15+
- **Migration Tool:** Prisma Migrate or TypeORM migrations
- **Connection Pooling:** pg-pool
- **Backup Strategy:** Automated daily backups

#### **Development Tools**
- **Package Manager:** pnpm or npm
- **Code Quality:** ESLint, Prettier
- **Testing:** Vitest (unit), Playwright (e2e)
- **API Testing:** Supertest
- **Git Hooks:** Husky + lint-staged
- **Monorepo (Optional):** Nx or Turborepo

#### **Deployment & Infrastructure** (No Docker)
- **Backend Hosting:** 
  - Windows IIS with iisnode
  - PM2 process manager on Windows Server
  - Windows Service wrapper (node-windows)
- **Frontend Hosting:**
  - IIS static file hosting
  - CDN integration (Cloudflare, Azure CDN)
- **Database:** 
  - PostgreSQL on Windows Server
  - Managed service (Azure Database, AWS RDS)
- **Reverse Proxy:** IIS with URL Rewrite or Nginx for Windows
- **SSL/TLS:** Let's Encrypt or corporate certificates
- **Monitoring:** Application Insights, New Relic, or Datadog

---

## 📋 Migration Strategy

### Phase 1: Foundation & Setup (Weeks 1-2)

#### 1.1 Project Setup
```bash
# Workspace structure
tech-v2/
├── frontend/                 # React application
│   ├── src/
│   │   ├── components/      # Reusable components
│   │   ├── pages/           # Page components
│   │   ├── features/        # Feature-specific modules
│   │   ├── hooks/           # Custom React hooks
│   │   ├── services/        # API services
│   │   ├── utils/           # Utility functions
│   │   ├── types/           # TypeScript types
│   │   ├── store/           # State management
│   │   ├── assets/          # Static assets
│   │   └── App.tsx
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── backend/                  # Node.js API
│   ├── src/
│   │   ├── controllers/     # Route controllers
│   │   ├── services/        # Business logic
│   │   ├── models/          # Database models
│   │   ├── middleware/      # Express middleware
│   │   ├── routes/          # API routes
│   │   ├── utils/           # Utility functions
│   │   ├── config/          # Configuration
│   │   ├── types/           # TypeScript types
│   │   └── server.ts
│   ├── prisma/              # Database schema
│   ├── tests/
│   ├── package.json
│   └── tsconfig.json
├── shared/                   # Shared types & utilities
│   ├── types/
│   └── constants/
├── docs/                     # Documentation
├── scripts/                  # Migration & utility scripts
└── README.md
```

#### 1.2 Environment Configuration
- Set up environment variables (.env files)
- Configure database connections
- Set up Microsoft Entra ID (Azure AD) app registration
  - Create app registration in Azure Portal
  - Configure redirect URIs
  - Set up client secret
  - Configure API permissions (User.Read, Group.Read.All)
  - Note Tenant ID and Client ID
- Configure email server settings
- Set up file upload directories and permissions

**Backend .env Example:**
```
DATABASE_URL="postgresql://user:password@localhost:5432/techdb"
JWT_SECRET="your-jwt-secret"
ENTRA_TENANT_ID="your-tenant-id"
ENTRA_CLIENT_ID="your-client-id"
ENTRA_CLIENT_SECRET="your-client-secret"
REDIRECT_URI="http://localhost:3000/api/auth/callback"
ENTRA_ADMIN_GROUP_ID="admin-group-object-id"
```

**Frontend .env Example:**
```
VITE_API_URL="http://localhost:3000/api"
VITE_ENTRA_CLIENT_ID="your-client-id"
VITE_ENTRA_TENANT_ID="your-tenant-id"
```

#### 1.3 Version Control
- Initialize Git repository
- Create .gitignore for Node.js projects
- Set up branch protection rules
- Establish branching strategy (main, develop, feature/*)

### Phase 2: Database Migration (Weeks 2-3)

#### 2.1 Schema Analysis
- Document existing MySQL database schema
- Map relationships and constraints
- Identify data types needing conversion
- Document stored procedures/triggers (if any)

#### 2.2 PostgreSQL Setup
- Install PostgreSQL 15+
- Create database and user accounts
- Configure connection pooling
- Set up backup strategy

#### 2.3 Schema Migration
- Create Prisma schema based on MySQL structure
- Handle MySQL → PostgreSQL type conversions
- Set up proper indexes
- Implement foreign key constraints
- Create database migration scripts

**Key Tables to Migrate (estimated):**
- users (user management)
- equipment (inventory items)
- purchase_orders
- food_requisitions
- maintenance_orders
- locations/rooms
- brands, companies, models
- expense_reports
- audit_logs

#### 2.4 Data Migration
- Export data from MySQL
- Transform data as needed
- Import to PostgreSQL
- Validate data integrity
- Performance testing

### Phase 3: Backend API Development (Weeks 4-8)

#### 3.1 Core Infrastructure
**Week 4:**
- Set up Express.js/Fastify server with TypeScript
- Configure middleware (CORS, Helmet, rate limiting)
- Set up error handling
- Configure logging
- Implement health check endpoints
- Set up Swagger/OpenAPI documentation

#### 3.2 Authentication & Authorization
**Week 4-5:**
- Implement Microsoft Entra ID (Azure AD) authentication
- OAuth 2.0 / OpenID Connect integration
- Microsoft Authentication Library (MSAL) setup
- User session management with JWT tokens
- Role-based access control (RBAC) using Entra ID groups
- Conditional Access policies support
- Multi-factor authentication (MFA) via Entra ID

**Endpoints:**
```
GET    /api/auth/login              # Redirect to Entra ID login
GET    /api/auth/callback           # OAuth callback handler
POST   /api/auth/logout
POST   /api/auth/refresh-token
GET    /api/auth/me
GET    /api/users/sync-entra        # Sync users from Entra ID
GET    /api/users/groups            # Get Entra ID groups
```

#### 3.3 User Management Module
**Week 5:**
- Sync users from Microsoft Entra ID
- User profile management (supplementary data)
- Room/location assignments
- Role and group management (linked to Entra ID groups)
- User search and filtering
- Periodic sync jobs for user updates

**Endpoints:**
```
GET    /api/users
GET    /api/users/:id
POST   /api/users
PUT    /api/users/:id
DELETE /api/users/:id
GET    /api/users/search
PUT    /api/users/:id/rooms
PUT    /api/users/:id/password
```

#### 3.4 Inventory Management Module
**Week 6:**
- Equipment CRUD operations
- Inventory tracking
- Asset assignment
- Disposal workflow
- Inventory changes/audit
- Search and filtering

**Endpoints:**
```
GET    /api/inventory
GET    /api/inventory/:id
POST   /api/inventory
PUT    /api/inventory/:id
DELETE /api/inventory/:id
POST   /api/inventory/:id/dispose
GET    /api/inventory/search
GET    /api/inventory/changes
GET    /api/inventory/disposed
POST   /api/inventory/bulk-import
```

#### 3.5 Purchase Order Module
**Week 6-7:**
- PO creation and management
- Approval workflow
- Food requisitions
- PO status tracking
- Vendor management

**Endpoints:**
```
GET    /api/purchase-orders
GET    /api/purchase-orders/:id
POST   /api/purchase-orders
PUT    /api/purchase-orders/:id
DELETE /api/purchase-orders/:id
POST   /api/purchase-orders/:id/approve
POST   /api/purchase-orders/:id/reject
GET    /api/food-requisitions
POST   /api/food-requisitions
POST   /api/food-requisitions/:id/approve
```

#### 3.6 Maintenance & Support Module
**Week 7:**
- Maintenance order creation
- Ticket tracking
- Status updates
- Assignment workflow

**Endpoints:**
```
GET    /api/maintenance-orders
GET    /api/maintenance-orders/:id
POST   /api/maintenance-orders
PUT    /api/maintenance-orders/:id
PUT    /api/maintenance-orders/:id/status
GET    /api/tickets
POST   /api/tickets
```

#### 3.7 Reporting & Export Module
**Week 8:**
- Excel report generation
- Expense reports by program
- PDF generation
- Custom report builder
- Data export functionality

**Endpoints:**
```
GET    /api/reports/expense-by-program
GET    /api/reports/inventory-summary
POST   /api/reports/custom
GET    /api/exports/excel/:reportType
GET    /api/exports/pdf/:reportType
```

#### 3.8 Reference Data Module
**Week 8:**
- Brands, companies, models management
- Locations/rooms management
- Categories and types
- Configuration settings

**Endpoints:**
```
GET    /api/brands
POST   /api/brands
GET    /api/companies
POST   /api/companies
GET    /api/models
POST   /api/models
GET    /api/locations
POST   /api/locations
```

#### 3.9 File Upload Module
**Ongoing:**
- File upload handling
- File validation
- Storage management
- File retrieval

**Endpoints:**
```
POST   /api/uploads
GET    /api/uploads/:id
DELETE /api/uploads/:id
POST   /api/uploads/transcript
POST   /api/uploads/sped-docs
```

### Phase 4: Frontend Development (Weeks 9-14)

#### 4.1 Core Setup & Routing
**Week 9:**
- Initialize Vite + React + TypeScript project
- Configure routing structure
- Set up layout components (Header, Sidebar, Footer)
- Implement navigation
- Create authentication guards
- Set up error boundaries

#### 4.2 Authentication UI
**Week 9:**
- Login page
- Password reset flow
- Session timeout handling
- Protected route wrapper
- User profile dropdown

#### 4.3 Dashboard & Home
**Week 9-10:**
- Main dashboard with statistics
- Recent activity feed
- Quick access widgets
- Notifications center
- User welcome screen

#### 4.4 User Management UI
**Week 10:**
- User list with search/filter
- User detail view
- User creation form
- User editing form
- Room assignment interface
- Bulk operations

#### 4.5 Inventory Management UI
**Week 11:**
- Equipment list with advanced filtering
- Equipment detail view
- Add/edit equipment forms
- Disposal workflow UI
- Inventory changes log
- Search functionality
- Barcode scanner integration (optional)

#### 4.6 Purchase Order UI
**Week 11-12:**
- PO list and filtering
- PO creation wizard
- PO approval interface
- Food requisition forms
- Status tracking
- Vendor selection

#### 4.7 Maintenance & Tickets UI
**Week 12:**
- Maintenance order list
- Create maintenance order
- Ticket management
- Status updates
- Assignment interface

#### 4.8 Reporting UI
**Week 13:**
- Report selection interface
- Expense report by program
- Custom report builder
- Excel export buttons
- PDF preview and download
- Data visualization (charts)

#### 4.9 Reference Data UI
**Week 13:**
- Brands/Companies/Models management
- Location/Room management
- Settings and configuration
- Master data administration

#### 4.10 Mobile Optimization
**Week 14:**
- Responsive design refinement
- Mobile navigation
- Touch-friendly interfaces
- PWA setup (optional)
- Offline capabilities (optional)

### Phase 5: Testing & Quality Assurance (Weeks 15-16)

#### 5.1 Backend Testing
- Unit tests for services and utilities
- Integration tests for API endpoints
- Database transaction tests
- LDAP/AD integration tests
- Email notification tests
- File upload/download tests
- Security testing (penetration testing)

#### 5.2 Frontend Testing
- Component unit tests
- Integration tests for features
- End-to-end testing (Playwright)
- Cross-browser testing
- Accessibility testing (WCAG compliance)
- Performance testing (Lighthouse)

#### 5.3 User Acceptance Testing (UAT)
- Create test scenarios
- Invite stakeholders for testing
- Document feedback
- Fix critical issues
- Regression testing

### Phase 6: Deployment Preparation (Week 17)

#### 6.1 Backend Deployment Setup
**Windows Server/IIS Configuration:**
- Install Node.js on Windows Server
- Set up PM2 or node-windows for process management
- Configure IIS with iisnode module
- Set up URL Rewrite rules
- Configure application pool
- Set environment variables
- Configure logging and monitoring

**web.config for IIS:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <add name="iisnode" path="server.js" verb="*" modules="iisnode"/>
    </handlers>
    <rewrite>
      <rules>
        <rule name="NodeInspector" patternSyntax="ECMAScript" stopProcessing="true">
          <match url="^server.js\/debug[\/]?" />
        </rule>
        <rule name="StaticContent">
          <action type="Rewrite" url="public{REQUEST_URI}"/>
        </rule>
        <rule name="DynamicContent">
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="True"/>
          </conditions>
          <action type="Rewrite" url="server.js"/>
        </rule>
      </rules>
    </rewrite>
    <security>
      <requestFiltering>
        <hiddenSegments>
          <add segment="node_modules"/>
        </hiddenSegments>
      </requestFiltering>
    </security>
    <httpErrors existingResponse="PassThrough" />
  </system.webServer>
</configuration>
```

#### 6.2 Frontend Deployment Setup
- Build production bundle (`npm run build`)
- Configure IIS for SPA (Single Page Application)
- Set up URL rewrite for client-side routing
- Configure caching headers
- Enable compression (gzip/brotli)
- Set up CDN for static assets (optional)

**web.config for React SPA:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="React Routes" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/" />
        </rule>
      </rules>
    </rewrite>
    <staticContent>
      <mimeMap fileExtension=".json" mimeType="application/json" />
    </staticContent>
    <httpCompression>
      <dynamicTypes>
        <add mimeType="application/javascript" enabled="true" />
        <add mimeType="text/css" enabled="true" />
      </dynamicTypes>
    </httpCompression>
  </system.webServer>
</configuration>
```

#### 6.3 Database Deployment
- Set up PostgreSQL on production server
- Configure connection strings
- Run database migrations
- Set up automated backups
- Configure monitoring and alerts

#### 6.4 SSL/TLS Configuration
- Obtain SSL certificate
- Configure HTTPS in IIS
- Set up HTTP to HTTPS redirect
- Configure HSTS headers

#### 6.5 Monitoring & Logging
- Set up application logging
- Configure error tracking (Sentry, Application Insights)
- Set up performance monitoring
- Configure alerts for critical issues
- Set up uptime monitoring

### Phase 7: Migration & Go-Live (Week 18)

#### 7.1 Pre-Migration Tasks
- Final UAT sign-off
- Create rollback plan
- Schedule maintenance window
- Notify all users
- Backup all production data

#### 7.2 Migration Execution
- Put legacy system in read-only mode
- Final data sync from MySQL to PostgreSQL
- Deploy backend application
- Deploy frontend application
- Smoke testing
- Switch DNS/routing to new system

#### 7.3 Post-Migration Tasks
- Monitor system performance
- Address any critical issues
- User support and training
- Collect feedback
- Performance optimization

#### 7.4 Parallel Running (Optional)
- Run both systems for 1-2 weeks
- Compare data and functionality
- Build user confidence
- Gradual transition

### Phase 8: Training & Documentation (Week 18-19)

#### 8.1 User Documentation
- User manual (end-user guide)
- Quick start guides
- Video tutorials
- FAQ document
- Troubleshooting guide

#### 8.2 Technical Documentation
- API documentation (Swagger/OpenAPI)
- Architecture documentation
- Database schema documentation
- Deployment guide
- Maintenance procedures

#### 8.3 Training Sessions
- Admin user training
- End-user training sessions
- Q&A sessions
- Hands-on workshops

---

## 📦 Detailed Implementation Guide

### Backend Implementation Details

#### 1. Project Initialization
```bash
mkdir backend
cd backend
npm init -y
npm install express typescript @types/node @types/express ts-node-dev
npm install prisma @prisma/client
npm install dotenv cors helmet express-rate-limit
npm install jsonwebtoken
npm install @types/jsonwebtoken --save-dev
npm install @azure/msal-node passport passport-azure-ad
npm install @microsoft/microsoft-graph-client @azure/identity
npm install nodemailer exceljs pdfkit
npm install zod joi winston
npm install multer @types/multer

# Initialize TypeScript
npx tsc --init

# Initialize Prisma
npx prisma init
```

#### 2. Database Schema Example (Prisma)
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id              String    @id @default(uuid())
  username        String    @unique
  email           String    @unique
  firstName       String
  lastName        String
  passwordHash    String?
  isActive        Boolean   @default(true)
  isAdmin         Boolean   @default(false)
  department      String?
  adSynced        Boolean   @default(false)
  lastLogin       DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  rooms           UserRoom[]
  createdOrders   MaintenanceOrder[] @relation("CreatedBy")
  assignedOrders  MaintenanceOrder[] @relation("AssignedTo")
  purchaseOrders  PurchaseOrder[]
  
  @@map("users")
}

model Equipment {
  id              String    @id @default(uuid())
  assetTag        String    @unique
  serialNumber    String?
  name            String
  description     String?
  brandId         String?
  modelId         String?
  locationId      String?
  categoryId      String?
  purchaseDate    DateTime?
  purchasePrice   Decimal?
  status          String    @default("active")
  condition       String?
  isDisposed      Boolean   @default(false)
  disposedDate    DateTime?
  disposedReason  String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  brand           Brand?    @relation(fields: [brandId], references: [id])
  model           Model?    @relation(fields: [modelId], references: [id])
  location        Location? @relation(fields: [locationId], references: [id])
  category        Category? @relation(fields: [categoryId], references: [id])
  changes         InventoryChange[]
  
  @@map("equipment")
}

model PurchaseOrder {
  id              String    @id @default(uuid())
  poNumber        String    @unique
  type            String    // "regular" or "food"
  requestorId     String
  vendorId        String?
  description     String
  amount          Decimal
  status          String    @default("pending")
  accountCode     String?
  program         String?
  isApproved      Boolean   @default(false)
  approvedBy      String?
  approvedDate    DateTime?
  submittedDate   DateTime  @default(now())
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  requestor       User      @relation(fields: [requestorId], references: [id])
  vendor          Vendor?   @relation(fields: [vendorId], references: [id])
  items           POItem[]
  
  @@map("purchase_orders")
}

model MaintenanceOrder {
  id              String    @id @default(uuid())
  ticketNumber    String    @unique
  title           String
  description     String
  priority        String    @default("medium")
  status          String    @default("open")
  createdById     String
  assignedToId    String?
  locationId      String?
  equipmentId     String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  completedAt     DateTime?
  
  createdBy       User      @relation("CreatedBy", fields: [createdById], references: [id])
  assignedTo      User?     @relation("AssignedTo", fields: [assignedToId], references: [id])
  location        Location? @relation(fields: [locationId], references: [id])
  
  @@map("maintenance_orders")
}

model Location {
  id              String    @id @default(uuid())
  buildingName    String
  roomNumber      String
  description     String?
  floor           Int?
  capacity        Int?
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  equipment       Equipment[]
  userRooms       UserRoom[]
  maintenanceOrders MaintenanceOrder[]
  
  @@unique([buildingName, roomNumber])
  @@map("locations")
}

model Brand {
  id              String    @id @default(uuid())
  name            String    @unique
  description     String?
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  
  equipment       Equipment[]
  models          Model[]
  
  @@map("brands")
}

model Model {
  id              String    @id @default(uuid())
  name            String
  brandId         String
  modelNumber     String?
  description     String?
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  
  brand           Brand     @relation(fields: [brandId], references: [id])
  equipment       Equipment[]
  
  @@unique([name, brandId])
  @@map("models")
}

// Additional models...
model Category {
  id              String    @id @default(uuid())
  name            String    @unique
  description     String?
  
  equipment       Equipment[]
  
  @@map("categories")
}

model Vendor {
  id              String    @id @default(uuid())
  name            String    @unique
  contactName     String?
  email           String?
  phone           String?
  address         String?
  
  purchaseOrders  PurchaseOrder[]
  
  @@map("vendors")
}

model POItem {
  id              String    @id @default(uuid())
  poId            String
  description     String
  quantity        Int
  unitPrice       Decimal
  totalPrice      Decimal
  
  purchaseOrder   PurchaseOrder @relation(fields: [poId], references: [id], onDelete: Cascade)
  
  @@map("po_items")
}

model UserRoom {
  id              String    @id @default(uuid())
  userId          String
  locationId      String
  assignedAt      DateTime  @default(now())
  
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  location        Location  @relation(fields: [locationId], references: [id], onDelete: Cascade)
  
  @@unique([userId, locationId])
  @@map("user_rooms")
}

model InventoryChange {
  id              String    @id @default(uuid())
  equipmentId     String
  changeType      String    // "added", "modified", "disposed"
  fieldChanged    String?
  oldValue        String?
  newValue        String?
  changedBy       String
  changedAt       DateTime  @default(now())
  notes           String?
  
  equipment       Equipment @relation(fields: [equipmentId], references: [id])
  
  @@map("inventory_changes")
}
```

#### 3. Authentication Middleware Example (Entra ID)
```typescript
// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { ClientSecretCredential } from '@azure/identity';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    roles: string[];
    groups: string[];
  };
}

// Validate JWT token issued by Entra ID
export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    // Verify token from Entra ID
    const decoded = jwt.decode(token) as any;
    
    // Validate token claims
    if (!decoded || !decoded.oid) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = {
      id: decoded.oid,  // Object ID from Entra ID
      email: decoded.preferred_username || decoded.email,
      name: decoded.name,
      roles: decoded.roles || [],
      groups: decoded.groups || [],
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Check if user has admin role (via Entra ID group or app role)
export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const adminGroupId = process.env.ENTRA_ADMIN_GROUP_ID;
  const hasAdminRole = req.user?.roles.includes('Admin');
  const isInAdminGroup = req.user?.groups.includes(adminGroupId!);
  
  if (!hasAdminRole && !isInAdminGroup) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Check if user belongs to specific Entra ID group
export const requireGroup = (groupId: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.groups.includes(groupId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
};
```

#### 4. Entra ID Configuration Example
```typescript
// backend/src/config/entraId.ts
import { ConfidentialClientApplication, Configuration } from '@azure/msal-node';

const msalConfig: Configuration = {
  auth: {
    clientId: process.env.ENTRA_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}`,
    clientSecret: process.env.ENTRA_CLIENT_SECRET!,
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) {
        console.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: 'Info',
    },
  },
};

export const msalClient = new ConfidentialClientApplication(msalConfig);

// Microsoft Graph API client setup
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { ClientSecretCredential } from '@azure/identity';

const credential = new ClientSecretCredential(
  process.env.ENTRA_TENANT_ID!,
  process.env.ENTRA_CLIENT_ID!,
  process.env.ENTRA_CLIENT_SECRET!
);

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});

export const graphClient = Client.initWithMiddleware({ authProvider });
```

```typescript
// backend/src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import { msalClient, graphClient } from '../config/entraId';
import jwt from 'jsonwebtoken';

export const login = async (req: Request, res: Response) => {
  // Redirect to Entra ID login
  const authCodeUrlParameters = {
    scopes: ['user.read', 'profile', 'openid'],
    redirectUri: process.env.REDIRECT_URI!,
  };

  try {
    const authUrl = await msalClient.getAuthCodeUrl(authCodeUrlParameters);
    res.redirect(authUrl);
  } catch (error) {
    res.status(500).json({ error: 'Authentication failed' });
  }
};

export const callback = async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'No authorization code' });
  }

  const tokenRequest = {
    code: code as string,
    scopes: ['user.read', 'profile', 'openid'],
    redirectUri: process.env.REDIRECT_URI!,
  };

  try {
    const response = await msalClient.acquireTokenByCode(tokenRequest);
    
    // Get user info from Microsoft Graph
    const userInfo = await graphClient
      .api('/me')
      .header('Authorization', `Bearer ${response.accessToken}`)
      .get();

    // Get user's group memberships
    const groups = await graphClient
      .api('/me/memberOf')
      .header('Authorization', `Bearer ${response.accessToken}`)
      .get();

    // Create JWT for your application
    const appToken = jwt.sign(
      {
        id: userInfo.id,
        email: userInfo.userPrincipalName,
        name: userInfo.displayName,
        groups: groups.value.map((g: any) => g.id),
      },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );

    res.json({
      token: appToken,
      user: {
        id: userInfo.id,
        email: userInfo.userPrincipalName,
        name: userInfo.displayName,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Token acquisition failed' });
  }
};

export const syncUsers = async (req: Request, res: Response) => {
  try {
    // Get all users from Entra ID
    const users = await graphClient
      .api('/users')
      .select('id,displayName,userPrincipalName,mail,department')
      .get();

    // Sync to local database
    // ... implementation

    res.json({ message: 'Users synced successfully', count: users.value.length });
  } catch (error) {
    res.status(500).json({ error: 'User sync failed' });
  }
};
```

#### 5. API Route Example
```typescript
// backend/src/routes/equipment.routes.ts
import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import * as equipmentController from '../controllers/equipment.controller';

const router = Router();

router.get('/', authenticate, equipmentController.getAll);
router.get('/search', authenticate, equipmentController.search);
router.get('/:id', authenticate, equipmentController.getById);
router.post('/', authenticate, requireAdmin, equipmentController.create);
router.put('/:id', authenticate, requireAdmin, equipmentController.update);
router.delete('/:id', authenticate, requireAdmin, equipmentController.remove);
router.post('/:id/dispose', authenticate, requireAdmin, equipmentController.dispose);

export default router;
```

### Frontend Implementation Details

#### 1. Project Initialization
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install react-router-dom @tanstack/react-query axios
npm install zustand
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled
# OR for Tailwind
npm install -D tailwindcss postcss autoprefixer
npm install react-hook-form zod @hookform/resolvers
npm install @tanstack/react-table
npm install date-fns
npm install xlsx
npm install recharts
npm install @azure/msal-browser @azure/msal-react
```

#### 2. Entra ID Frontend Setup
```typescript
// frontend/src/config/authConfig.ts
import { Configuration, PublicClientApplication } from '@azure/msal-browser';

const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const loginRequest = {
  scopes: ['User.Read', 'profile', 'openid'],
};
```

```typescript
// frontend/src/App.tsx
import { MsalProvider } from '@azure/msal-react';
import { msalInstance } from './config/authConfig';

function App() {
  return (
    <MsalProvider instance={msalInstance}>
      {/* Your app components */}
    </MsalProvider>
  );
}
```

```typescript
// frontend/src/components/Login.tsx
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../config/authConfig';

export const Login: React.FC = () => {
  const { instance } = useMsal();

  const handleLogin = async () => {
    try {
      await instance.loginRedirect(loginRequest);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <button onClick={handleLogin}>
      Sign in with Microsoft
    </button>
  );
};
```

#### 3. API Service Layer Example
```typescript
// frontend/src/services/api.ts
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const response = await axios.post(`${API_URL}/auth/refresh-token`, {
          refreshToken,
        });
        
        const { token } = response.data;
        localStorage.setItem('token', token);
        
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Equipment API
export const equipmentApi = {
  getAll: (params?: any) => api.get('/equipment', { params }),
  getById: (id: string) => api.get(`/equipment/${id}`),
  create: (data: any) => api.post('/equipment', data),
  update: (id: string, data: any) => api.put(`/equipment/${id}`, data),
  delete: (id: string) => api.delete(`/equipment/${id}`),
  dispose: (id: string, reason: string) => 
    api.post(`/equipment/${id}/dispose`, { reason }),
  search: (query: string) => 
    api.get('/equipment/search', { params: { q: query } }),
};

// User API
export const userApi = {
  getAll: () => api.get('/users'),
  getById: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  updateRooms: (id: string, roomIds: string[]) => 
    api.put(`/users/${id}/rooms`, { roomIds }),
};

// Auth API
export const authApi = {
  login: () => window.location.href = `${API_URL}/auth/login`, // Redirect to Entra ID
  logout: async () => {
    await api.post('/auth/logout');
    // Also logout from Entra ID
    const msalInstance = getMsalInstance();
    await msalInstance.logoutRedirect();
  },
  refreshToken: (refreshToken: string) =>
    api.post('/auth/refresh-token', { refreshToken }),
  getMe: () => api.get('/auth/me'),
  syncUsers: () => api.get('/users/sync-entra'),
};
```

#### 3. React Query Setup Example
```typescript
// frontend/src/hooks/useEquipment.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { equipmentApi } from '../services/api';

export const useEquipment = () => {
  const queryClient = useQueryClient();

  const equipmentQuery = useQuery({
    queryKey: ['equipment'],
    queryFn: () => equipmentApi.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: equipmentApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      equipmentApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: equipmentApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    },
  });

  return {
    equipment: equipmentQuery.data?.data,
    isLoading: equipmentQuery.isLoading,
    error: equipmentQuery.error,
    createEquipment: createMutation.mutate,
    updateEquipment: updateMutation.mutate,
    deleteEquipment: deleteMutation.mutate,
  };
};
```

#### 4. Component Example
```typescript
// frontend/src/pages/Equipment/EquipmentList.tsx
import React, { useState } from 'react';
import { useEquipment } from '../../hooks/useEquipment';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  TextField,
  CircularProgress,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

export const EquipmentList: React.FC = () => {
  const navigate = useNavigate();
  const { equipment, isLoading, error } = useEquipment();
  const [searchTerm, setSearchTerm] = useState('');

  if (isLoading) return <CircularProgress />;
  if (error) return <div>Error loading equipment</div>;

  const filteredEquipment = equipment?.filter((item: any) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.assetTag.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <TextField
          label="Search Equipment"
          variant="outlined"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={() => navigate('/equipment/new')}
        >
          Add Equipment
        </Button>
      </div>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Asset Tag</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Brand</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredEquipment?.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell>{item.assetTag}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.brand?.name}</TableCell>
                <TableCell>{item.location?.roomNumber}</TableCell>
                <TableCell>{item.status}</TableCell>
                <TableCell>
                  <Button onClick={() => navigate(`/equipment/${item.id}`)}>
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};
```

---

## 🔒 Security Considerations

### Backend Security
1. **Input Validation:** Use Zod/Joi for all inputs
2. **SQL Injection:** Use Prisma ORM (parameterized queries)
3. **XSS Protection:** Sanitize outputs, use Content Security Policy
4. **CSRF Protection:** Implement CSRF tokens for state-changing operations
5. **Rate Limiting:** Prevent brute force attacks
6. **Helmet.js:** Security headers
7. **CORS:** Proper CORS configuration
8. **JWT Security:** Short-lived access tokens, secure refresh tokens
9. **Entra ID Security:** 
   - Validate token issuer and audience
   - Verify token signatures using Microsoft public keys
   - Implement token caching and refresh logic
   - Use Conditional Access policies for additional security
   - Enable MFA requirements through Entra ID
10. **HTTPS Only:** Enforce SSL/TLS
11. **Environment Variables:** Never commit secrets
12. **File Upload Validation:** Type, size, virus scanning
13. **Logging:** Audit trails for sensitive operations
14. **Error Handling:** Don't expose stack traces in production

### Frontend Security
1. **XSS Prevention:** React escapes by default, be careful with dangerouslySetInnerHTML
2. **Token Storage:** Store in httpOnly cookies (preferred) or localStorage with caution
3. **HTTPS Only:** All API calls over HTTPS
4. **Content Security Policy:** Implement CSP headers
5. **Dependency Scanning:** Regular npm audit
6. **Input Sanitization:** Validate on both client and server

---

## 📊 Performance Optimization

### Backend Optimization
1. **Database Indexing:** Index frequently queried fields
2. **Connection Pooling:** Efficient database connections
3. **Caching:** Redis for session storage and frequently accessed data
4. **Pagination:** Limit query results
5. **Query Optimization:** Use Prisma's efficient queries, avoid N+1 problems
6. **Compression:** Gzip/Brotli response compression
7. **Async Operations:** Use async/await properly
8. **Load Balancing:** Multiple server instances (if needed)

### Frontend Optimization
1. **Code Splitting:** Lazy load routes and components
2. **Bundle Optimization:** Tree shaking, minification
3. **Image Optimization:** Compress images, use modern formats (WebP)
4. **Caching:** Service workers, HTTP caching headers
5. **Debouncing:** Search inputs, API calls
6. **Virtual Scrolling:** For large lists (react-window)
7. **Memoization:** React.memo, useMemo, useCallback
8. **CDN:** Serve static assets from CDN

---

## 🧪 Testing Strategy

### Backend Testing
```typescript
// Example unit test (Vitest)
import { describe, it, expect } from 'vitest';
import { calculateTotal } from './utils';

describe('Utility Functions', () => {
  it('should calculate total correctly', () => {
    expect(calculateTotal(10, 5)).toBe(50);
  });
});

// Example API test (Supertest)
import request from 'supertest';
import { app } from './server';

describe('Equipment API', () => {
  it('should return all equipment', async () => {
    const response = await request(app)
      .get('/api/equipment')
      .set('Authorization', `Bearer ${testToken}`);
    
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
```

### Frontend Testing
```typescript
// Example component test (Vitest + React Testing Library)
import { render, screen } from '@testing-library/react';
import { EquipmentList } from './EquipmentList';

describe('EquipmentList', () => {
  it('should render equipment list', () => {
    render(<EquipmentList />);
    expect(screen.getByText('Add Equipment')).toBeInTheDocument();
  });
});
```

---

## 📈 Monitoring & Maintenance

### Application Monitoring
1. **Uptime Monitoring:** Pingdom, UptimeRobot
2. **Error Tracking:** Sentry, Application Insights
3. **Performance Monitoring:** New Relic, Datadog
4. **Logging:** Winston, centralized log management
5. **Metrics:** Custom dashboards (Grafana)

### Database Monitoring
1. **Query Performance:** Slow query logs
2. **Connection Pool:** Monitor connection usage
3. **Backup Verification:** Test restore procedures
4. **Disk Space:** Alert on low disk space
5. **Replication Lag:** If using replication

### Maintenance Tasks
1. **Dependency Updates:** Monthly security updates
2. **Database Optimization:** Quarterly VACUUM, ANALYZE
3. **Log Rotation:** Prevent disk space issues
4. **Certificate Renewal:** SSL/TLS certificates
5. **Backup Testing:** Quarterly restore tests
6. **Performance Review:** Quarterly performance audits

---

## 💰 Cost Estimation

### Development Costs (Internal Team)
- **Backend Development:** 8 weeks × 40 hours = 320 hours
- **Frontend Development:** 6 weeks × 40 hours = 240 hours
- **Database Migration:** 2 weeks × 40 hours = 80 hours
- **Testing & QA:** 2 weeks × 40 hours = 80 hours
- **Deployment & Training:** 2 weeks × 40 hours = 80 hours
- **Total:** ~800 hours

**Assumptions:** 1-2 full-stack developers, part-time DBA, part-time DevOps

### Infrastructure Costs (Annual Estimates)
- **Windows Server:** $0 (if existing infrastructure)
- **PostgreSQL:** $0 (if self-hosted) or $50-200/month (managed)
- **SSL Certificates:** $0 (Let's Encrypt) or $50-200/year
- **Monitoring Tools:** $0-100/month
- **CDN (Optional):** $0-50/month
- **Email Service:** $0 (if using internal SMTP)

---

## 🎯 Success Metrics

### Technical Metrics
- **Page Load Time:** < 2 seconds
- **API Response Time:** < 500ms (95th percentile)
- **Uptime:** > 99.5%
- **Code Coverage:** > 80%
- **Security Vulnerabilities:** 0 critical/high

### Business Metrics
- **User Adoption:** 100% within 1 month
- **Support Tickets:** < 50% of baseline
- **User Satisfaction:** > 4/5
- **Time to Complete Tasks:** 30% reduction
- **Data Accuracy:** > 99%

---

## 🚨 Risk Mitigation

### Technical Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Data migration issues | High | Comprehensive testing, parallel running |
| Performance degradation | Medium | Load testing, optimization |
| Security vulnerabilities | High | Security audits, penetration testing |
| Third-party dependency issues | Medium | Vendor lock-in avoidance, abstractions |
| Active Directory integration failure | High | Thorough testing, fallback auth |

### Business Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| User resistance to change | High | Training, phased rollout |
| Extended downtime | High | Thorough planning, rollback plan |
| Budget overrun | Medium | Phased approach, MVP first |
| Key personnel leaving | Medium | Documentation, knowledge transfer |
| Scope creep | Medium | Strict change management |

---

## 📝 Next Steps

### Immediate Actions (Week 1)
1. ✅ Review and approve this modernization plan
2. ✅ Assemble development team
3. ✅ Set up development environment
4. ✅ Initialize Git repository
5. ✅ Set up project management tool (Jira, Azure DevOps, etc.)

### Short-term Actions (Weeks 2-4)
1. ✅ Analyze and document current database schema
2. ✅ Set up PostgreSQL development environment
3. ✅ Create detailed user stories and acceptance criteria
4. ✅ Set up CI/CD pipeline
5. ✅ Begin Phase 2: Database Migration

### Medium-term Actions (Weeks 5-12)
1. ✅ Complete backend API development
2. ✅ Complete frontend development
3. ✅ Conduct regular sprint reviews
4. ✅ User feedback sessions

### Long-term Actions (Weeks 13-20)
1. ✅ Testing and QA
2. ✅ User training
3. ✅ Deployment preparation
4. ✅ Go-live and support

---

## 🔗 Additional Resources

### Learning Resources
- **React Official Docs:** https://react.dev
- **TypeScript Handbook:** https://www.typescriptlang.org/docs/
- **Prisma Docs:** https://www.prisma.io/docs
- **Express.js Guide:** https://expressjs.com/
- **Material-UI:** https://mui.com/
- **React Query:** https://tanstack.com/query/latest

### Tools & Libraries
- **Vite:** https://vitejs.dev/
- **TanStack Table:** https://tanstack.com/table/latest
- **React Hook Form:** https://react-hook-form.com/
- **Zod:** https://zod.dev/
- **Winston:** https://github.com/winstonjs/winston
- **IISNode:** https://github.com/Azure/iisnode

### Community & Support
- **Stack Overflow:** For technical questions
- **GitHub Discussions:** For library-specific questions
- **Discord/Slack:** Framework communities
- **Reddit:** r/reactjs, r/node, r/typescript

---

## 📋 Appendix

### A. Current System File Structure Analysis
Based on the analysis of C:\wwwroot, the current system includes:
- **138 PHP files** (procedural code)
- **Key modules:** Authentication (AD), Inventory, Purchase Orders, Maintenance, Reporting
- **Libraries:** jQuery, Bootstrap 3, DataTables, PHPExcel, FancyBox
- **Database:** MySQL (deprecated mysql_* functions)

### B. Glossary
- **SPA:** Single Page Application
- **API:** Application Programming Interface
- **REST:** Representational State Transfer
- **JWT:** JSON Web Token
- **ORM:** Object-Relational Mapping
- **LDAP:** Lightweight Directory Access Protocol
- **AD:** Active Directory
- **CRUD:** Create, Read, Update, Delete
- **PWA:** Progressive Web Application
- **CDN:** Content Delivery Network

### C. Change Log
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-12 | AI Assistant | Initial comprehensive plan |

---

## ✅ Conclusion

This modernization plan provides a comprehensive roadmap to transform your legacy PHP application into a modern, maintainable, and scalable full-stack web application. The proposed architecture using React + TypeScript on the frontend and Node.js + Express + PostgreSQL on the backend will provide:

- **Better Performance:** Faster load times, optimized queries
- **Improved Security:** Modern authentication, input validation
- **Enhanced User Experience:** Responsive, intuitive interface
- **Easier Maintenance:** Modular code, clear separation of concerns
- **Scalability:** Ready for future growth
- **Developer Productivity:** Modern tooling, hot reload, TypeScript

The estimated timeline of 18-20 weeks is achievable with a dedicated team and proper planning. The phased approach allows for iterative development and early feedback, reducing risks and ensuring alignment with business needs.

**Recommended Next Step:** Schedule a kickoff meeting with stakeholders to review this plan, assign team members, and begin Phase 1.

---

*This document should be treated as a living document and updated as the project progresses. Regular reviews and adjustments will ensure the project stays on track and delivers maximum value.*
