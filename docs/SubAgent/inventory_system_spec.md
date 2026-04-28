# Inventory Management System - Comprehensive Specification

**Project:** Tech Department Management System v2 (Tech-V2)  
**Document Version:** 1.0  
**Created:** February 19, 2026  
**Status:** Draft Specification

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [System Requirements](#system-requirements)
4. [Data Model Specification](#data-model-specification)
5. [Backend Architecture](#backend-architecture)
6. [Frontend Architecture](#frontend-architecture)
7. [Import/Export Functionality](#importexport-functionality)
8. [Security & Permissions](#security--permissions)
9. [Implementation Phases](#implementation-phases)
10. [Integration Points](#integration-points)
11. [Testing Strategy](#testing-strategy)
12. [Best Practices Research](#best-practices-research)

---

## Executive Summary

### Purpose
Develop a comprehensive inventory management system to replace the existing Excel-based inventory tracking with a modern, web-based solution integrated into the Tech-V2 platform. The system will manage 9,150+ inventory items across multiple locations with complete audit trails, reporting capabilities, and role-based access control.

### Key Objectives
- **Centralized Management**: Single source of truth for all inventory items
- **Data Import**: Seamless migration from Excel format (Inventory - 02-03-2026.xlsx)
- **Full CRUD Operations**: Create, read, update, delete inventory items with validation
- **Asset Tracking**: Track equipment lifecycle from purchase to disposal
- **Audit Trail**: Complete history of all inventory changes with user attribution
- **Location Management**: Multi-location inventory tracking with room-level granularity
- **Advanced Reporting**: Generate reports by location, type, value, status
- **Export Capabilities**: Export to Excel, CSV, and PDF formats
- **Security**: Role-based access control with CSRF protection and secure logging

### Success Metrics
- Successfully import 9,150+ existing inventory records
- Zero data loss during migration
- < 2 second page load time for inventory lists
- 100% audit trail coverage for all changes
- Support for concurrent multi-location access
- Mobile-responsive interface

---

## Current State Analysis

### 1. Excel File Structure

**File:** `Inventory - 02-03-2026.xlsx`  
**Sheet:** "Non-disposed Equipment"  
**Total Records:** 9,150 items

#### Column Mapping

| Excel Column | Data Type | Description | Required | Notes |
|-------------|-----------|-------------|----------|-------|
| School | String | Location/School name | Yes | Maps to OfficeLocation |
| Room | String | Room/Department | No | Descriptive field |
| Tag# | Number | Asset tag number | Yes | Unique identifier |
| Type | String | Equipment type/category | Yes | Maps to Category |
| Brand | String | Manufacturer/Brand | No | Maps to Brand |
| Model Number | String | Product model | No | Maps to Model |
| Serial Number | String | Unique serial number | No | Equipment field |
| PO# | Number | Purchase order number | No | References purchase |
| Vendor | String | Supplier/Vendor | No | Maps to Vendor |
| Price | Number | Purchase price | No | Decimal(10,2) |
| Funds | String | Funding source | No | Account/budget code |
| Purchase Date | Date | Date of purchase | No | ISO date format |
| Disposal Date | String | Disposal date | No | "0000-00-00" means active |

#### Data Quality Observations

**Strengths:**
- Consistent asset tag numbers (unique identifiers)
- Well-defined location hierarchy
- Complete pricing information
- Historical purchase data

**Issues to Address:**
- Inconsistent date formats ("0000-00-00" for null dates)
- Missing data in optional fields
- Inconsistent brand/model capitalization
- Some duplicate serial numbers
- Location names need mapping to OfficeLocation IDs

### 2. Existing Database Schema

#### Current Models (Relevant)

**Equipment Table** (Existing):
```prisma
model equipment {
  id                String              @id @default(uuid())
  assetTag          String              @unique
  serialNumber      String?
  name              String
  description       String?
  brandId           String?
  modelId           String?
  locationId        String?
  categoryId        String?
  purchaseDate      DateTime?
  purchasePrice     Decimal?            @db.Decimal(10, 2)
  status            String              @default("active")
  condition         String?
  isDisposed        Boolean             @default(false)
  disposedDate      DateTime?
  disposedReason    String?
  notes             String?
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  // Relations
  brands            brands?             @relation(fields: [brandId], references: [id])
  categories        categories?         @relation(fields: [categoryId], references: [id])
  locations         locations?          @relation(fields: [locationId], references: [id])
  models            models?             @relation(fields: [modelId], references: [id])
  inventory_changes inventory_changes[]
}
```

**Inventory Changes Table** (Existing - Audit Trail):
```prisma
model inventory_changes {
  id            String    @id @default(uuid())
  equipmentId   String
  changeType    String
  fieldChanged  String?
  oldValue      String?
  newValue      String?
  changedBy     String
  changedByName String
  changedAt     DateTime  @default(now())
  notes         String?
  equipment     equipment @relation(fields: [equipmentId], references: [id], onDelete: Cascade)
}
```

**Supporting Tables** (Existing):
- `brands` - Equipment manufacturers
- `models` - Product models by brand
- `categories` - Equipment categories (hierarchical)
- `locations` - Physical room locations
- `OfficeLocation` - Office/school locations
- `vendors` - Supplier information
- `purchase_orders` - Purchase order tracking

#### Key Observations
1. **Equipment model already exists** - Good foundation for inventory
2. **Audit trail system in place** - inventory_changes table tracks all modifications
3. **Location hierarchy** - Two-level system (OfficeLocation → Room)
4. **Missing fields** compared to Excel:
   - Room mapping (Excel "Room" column)
   - Funding source (Excel "Funds" column)
   - PO number reference
5. **Additional capabilities** in database:
   - Condition tracking
   - Status management
   - Rich audit history

### 3. Existing Codebase Patterns

#### Backend Structure
```
backend/src/
├── controllers/        # Request handlers
│   ├── auth.controller.ts
│   ├── location.controller.ts
│   ├── room.controller.ts
│   └── user.controller.ts
├── services/          # Business logic
│   ├── location.service.ts
│   ├── room.service.ts
│   └── user.service.ts
├── routes/            # API route definitions
│   ├── auth.routes.ts
│   ├── location.routes.ts
│   ├── room.routes.ts
│   └── user.routes.ts
├── validators/        # Zod validation schemas
│   └── room.validators.ts
├── middleware/        # Custom middleware
│   ├── auth.ts        # JWT authentication
│   ├── csrf.ts        # CSRF protection
│   └── validation.ts  # Request validation
├── utils/            # Utility functions
│   ├── errors.ts     # Custom error classes
│   └── errorHandler.ts
└── lib/
    ├── prisma.ts     # Prisma client
    └── logger.ts     # Winston logger
```

#### Example Pattern (Room Management)
- **Route**: `/api/rooms` with CRUD endpoints
- **Validation**: Zod schemas for all inputs
- **Service Layer**: Business logic separation
- **Error Handling**: Custom error classes
- **Authentication**: JWT via cookies
- **CSRF Protection**: Double submit cookie pattern
- **Logging**: Winston with structured logging

#### Frontend Structure
```
frontend/src/
├── pages/
│   ├── Dashboard.tsx
│   ├── RoomManagement.tsx
│   └── Users.tsx
├── components/
│   ├── RoomFormModal.tsx
│   └── LocationsManagement.tsx
├── services/         # API service layer
│   ├── location.service.ts
│   └── roomService.ts
├── types/           # TypeScript interfaces
│   ├── room.types.ts
│   └── location.types.ts
├── hooks/           # Custom React hooks
├── store/           # State management
└── styles/          # CSS modules
```

#### Frontend Patterns
- **React 18** with TypeScript
- **Material-UI (MUI)** components
- **TanStack Query** for data fetching (to be implemented)
- **React Router v6** for navigation
- **Service layer** for API calls
- **Type-safe** API communication

### 4. Authentication & Authorization

#### Current System
- **Authentication**: Microsoft Entra ID (Azure AD) with JWT
- **Token Storage**: HttpOnly cookies (secure)
- **CSRF Protection**: Double submit cookie pattern
- **Roles**: ADMIN, MANAGER, TECHNICIAN, VIEWER
- **Permissions**: Module-based (6 modules with 3 levels each)

#### Permission Modules
1. **TECHNOLOGY** - Equipment and IT support
2. **MAINTENANCE** - Facilities management
3. **TRANSPORTATION** - Vehicle fleet
4. **NUTRITION** - Food service equipment
5. **CURRICULUM** - Educational materials
6. **FINANCE** - Budget and procurement

#### Access Control for Inventory
- **ADMIN**: Full inventory management across all locations
- **MANAGER**: Manage inventory at assigned locations
- **TECHNICIAN**: Update equipment status, perform audits
- **VIEWER**: Read-only access to inventory lists

---

## System Requirements

### Functional Requirements

#### FR1: Inventory Item Management
- FR1.1: Create new inventory items with all required fields
- FR1.2: Update existing inventory items (name, location, status, etc.)
- FR1.3: Delete inventory items (soft delete by default)
- FR1.4: View inventory item details with full history
- FR1.5: Search and filter inventory by multiple criteria
- FR1.6: Bulk operations (bulk update, bulk delete)

#### FR2: Asset Tracking
- FR2.1: Assign unique asset tags (auto-generate or manual)
- FR2.2: Track equipment lifecycle stages (received, active, maintenance, disposed)
- FR2.3: Record serial numbers and model information
- FR2.4: Link to purchase orders and vendors
- FR2.5: Track location changes with history
- FR2.6: Record disposal information with reason and date

#### FR3: Location Management
- FR3.1: Assign items to specific office locations
- FR3.2: Assign items to specific rooms within locations
- FR3.3: Transfer items between locations (with approval)
- FR3.4: View inventory by location hierarchy
- FR3.5: Track location history for each item

#### FR4: Financial Tracking
- FR4.1: Record purchase price and date
- FR4.2: Track funding source/account code
- FR4.3: Link to purchase orders
- FR4.4: Calculate total inventory value by location/category
- FR4.5: Generate depreciation reports (future phase)

#### FR5: Categorization & Classification
- FR5.1: Assign equipment to hierarchical categories
- FR5.2: Tag with brand and model information
- FR5.3: Define custom equipment types
- FR5.4: Support for multiple classification taxonomies

#### FR6: Import/Export
- FR6.1: Import from Excel (.xlsx) format
- FR6.2: Export to Excel (.xlsx) format
- FR6.3: Export to CSV format
- FR6.4: Export to PDF reports
- FR6.5: Data validation during import
- FR6.6: Import preview with error reporting
- FR6.7: Bulk update via Excel import

#### FR7: Audit Trail
- FR7.1: Record all inventory changes (create, update, delete)
- FR7.2: Track user responsible for each change
- FR7.3: Store old and new values for all field changes
- FR7.4: Add notes/comments to changes
- FR7.5: View complete change history for any item
- FR7.6: Filter audit logs by date, user, change type

#### FR8: Reporting & Analytics
- FR8.1: Inventory summary reports
- FR8.2: Location-based inventory reports
- FR8.3: Category/type distribution reports
- FR8.4: Asset value reports
- FR8.5: Disposal/depreciation reports
- FR8.6: Custom report builder (future phase)
- FR8.7: Scheduled report generation (future phase)

#### FR9: Search & Filtering
- FR9.1: Full-text search across all fields
- FR9.2: Advanced filtering (location, category, status, date range)
- FR9.3: Saved search filters
- FR9.4: Sort by any column
- FR9.5: Pagination for large result sets

#### FR10: Notifications & Alerts
- FR10.1: Notify supervisors of location transfers
- FR10.2: Alert on duplicate asset tags
- FR10.3: Remind for scheduled inventory audits (future phase)

### Non-Functional Requirements

#### NFR1: Performance
- Page load time < 2 seconds for inventory lists (up to 1000 items)
- Search results < 1 second
- Excel import processing < 30 seconds for 10,000 rows
- Support 50+ concurrent users
- Database query optimization with proper indexing

#### NFR2: Scalability
- Support 50,000+ inventory items
- Handle 100+ concurrent API requests
- Efficient pagination for large datasets
- Optimize database queries with indexes

#### NFR3: Security
- Role-based access control (RBAC)
- CSRF protection on all state-changing operations
- Input validation and sanitization
- Secure audit logging (no sensitive data in logs)
- SQL injection prevention via Prisma
- XSS prevention via React and input sanitization

#### NFR4: Reliability
- 99.5% uptime target
- Automated database backups
- Transaction support for critical operations
- Graceful error handling with user-friendly messages
- Data integrity constraints in database schema

#### NFR5: Usability
- Mobile-responsive design (tablet and phone support)
- Intuitive interface following Material Design guidelines
- Consistent with existing Tech-V2 UI/UX patterns
- Loading states and progress indicators
- Clear error messages and validation feedback

#### NFR6: Maintainability
- Follow existing codebase patterns and conventions
- Comprehensive code documentation
- Type safety with TypeScript
- Modular service-based architecture
- Unit and integration tests

#### NFR7: Compatibility
- Modern browsers (Chrome, Firefox, Edge, Safari - latest 2 versions)
- PostgreSQL 12+
- Node.js 18+
- React 18+

---

## Data Model Specification

### 1. Enhanced Equipment Model

**Modifications to existing `equipment` model:**

```prisma
model equipment {
  // Existing fields
  id                String              @id @default(uuid())
  assetTag          String              @unique
  serialNumber      String?
  name              String
  description       String?
  brandId           String?
  modelId           String?
  locationId        String?              // References locations (Room)
  categoryId        String?
  purchaseDate      DateTime?
  purchasePrice     Decimal?            @db.Decimal(10, 2)
  status            String              @default("active")
  condition         String?
  isDisposed        Boolean             @default(false)
  disposedDate      DateTime?
  disposedReason    String?
  notes             String?
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  
  // NEW FIELDS TO ADD
  officeLocationId  String?             // References OfficeLocation (School/Building)
  fundingSource     String?             // Account code or funding program
  poNumber          String?             // Purchase order number
  vendorId          String?             // References vendors
  warrantyExpires   DateTime?           // Warranty expiration date
  assignedToUserId  String?             // User responsible for equipment
  barcode           String?             @unique  // For barcode scanning
  qrCode            String?             // QR code data
  maintenanceSchedule String?           // Maintenance frequency (e.g., "monthly", "quarterly")
  lastMaintenanceDate DateTime?         // Last maintenance date
  customFields      Json?               // Flexible JSON for custom fields
  
  // Relations (existing)
  brands            brands?             @relation(fields: [brandId], references: [id])
  categories        categories?         @relation(fields: [categoryId], references: [id])
  locations         locations?          @relation(fields: [locationId], references: [id])
  models            models?             @relation(fields: [modelId], references: [id])
  inventory_changes inventory_changes[]
  
  // NEW RELATIONS TO ADD
  officeLocation    OfficeLocation?     @relation(fields: [officeLocationId], references: [id])
  vendor            vendors?            @relation(fields: [vendorId], references: [id])
  assignedToUser    User?               @relation("EquipmentAssignedTo", fields: [assignedToUserId], references: [id])
  attachments       EquipmentAttachment[]
  maintenanceHistory MaintenanceHistory[]
  
  @@index([assetTag])
  @@index([locationId])
  @@index([officeLocationId])  // NEW INDEX
  @@index([status])
  @@index([isDisposed])        // NEW INDEX
  @@index([categoryId])
  @@index([assignedToUserId])  // NEW INDEX
  @@map("equipment")
}
```

### 2. Equipment Attachments (NEW)

```prisma
model EquipmentAttachment {
  id          String    @id @default(uuid())
  equipmentId String
  fileName    String
  fileUrl     String                    // S3 or local file path
  fileType    String                    // MIME type
  fileSize    Int                       // Size in bytes
  description String?
  uploadedBy  String
  uploadedAt  DateTime  @default(now())
  
  equipment   equipment @relation(fields: [equipmentId], references: [id], onDelete: Cascade)
  user        User      @relation(fields: [uploadedBy], references: [id])
  
  @@index([equipmentId])
  @@map("equipment_attachments")
}
```

### 3. Maintenance History (NEW)

```prisma
model MaintenanceHistory {
  id              String    @id @default(uuid())
  equipmentId     String
  maintenanceType String              // "routine", "repair", "inspection", "calibration"
  description     String
  performedBy     String
  performedDate   DateTime
  cost            Decimal?  @db.Decimal(10, 2)
  notes           String?
  nextDueDate     DateTime?
  createdAt       DateTime  @default(now())
  
  equipment       equipment @relation(fields: [equipmentId], references: [id], onDelete: Cascade)
  user            User      @relation(fields: [performedBy], references: [id])
  
  @@index([equipmentId])
  @@index([performedDate])
  @@map("maintenance_history")
}
```

### 4. Inventory Import Jobs (NEW)

```prisma
model InventoryImportJob {
  id              String    @id @default(uuid())
  fileName        String
  fileUrl         String?
  status          String              // "pending", "processing", "completed", "failed"
  totalRows       Int
  processedRows   Int       @default(0)
  successCount    Int       @default(0)
  errorCount      Int       @default(0)
  errors          Json?               // Array of error objects
  importedBy      String
  startedAt       DateTime  @default(now())
  completedAt     DateTime?
  
  user            User      @relation(fields: [importedBy], references: [id])
  
  @@index([status])
  @@index([importedBy])
  @@map("inventory_import_jobs")
}
```

### 5. Equipment Status Enum (NEW)

**Valid status values:**
- `active` - Currently in use
- `available` - Ready for assignment
- `maintenance` - Under maintenance/repair
- `storage` - In storage/not in use
- `disposed` - Disposed/retired
- `lost` - Lost or stolen
- `damaged` - Damaged beyond repair
- `reserved` - Reserved for future use

### 6. Equipment Condition Enum (NEW)

**Valid condition values:**
- `excellent` - Like new
- `good` - Minor wear
- `fair` - Moderate wear, fully functional
- `poor` - Significant wear, limited functionality
- `broken` - Non-functional, needs repair

### Database Indexes

Critical indexes for performance:

```sql
-- Equipment table
CREATE INDEX idx_equipment_asset_tag ON equipment(assetTag);
CREATE INDEX idx_equipment_location ON equipment(locationId);
CREATE INDEX idx_equipment_office_location ON equipment(officeLocationId);
CREATE INDEX idx_equipment_category ON equipment(categoryId);
CREATE INDEX idx_equipment_status ON equipment(status);
CREATE INDEX idx_equipment_disposed ON equipment(isDisposed);
CREATE INDEX idx_equipment_assigned_user ON equipment(assignedToUserId);

-- Inventory changes
CREATE INDEX idx_inventory_changes_equipment ON inventory_changes(equipmentId);
CREATE INDEX idx_inventory_changes_date ON inventory_changes(changedAt DESC);
CREATE INDEX idx_inventory_changes_user ON inventory_changes(changedBy);

-- Composite indexes for common queries
CREATE INDEX idx_equipment_location_status ON equipment(officeLocationId, status);
CREATE INDEX idx_equipment_category_status ON equipment(categoryId, status);
```

---

## Backend Architecture

### 1. Routes Definition

**File**: `backend/src/routes/inventory.routes.ts`

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { checkPermission } from '../middleware/permissions';
import {
  InventoryIdParamSchema,
  GetInventoryQuerySchema,
  CreateInventorySchema,
  UpdateInventorySchema,
  BulkUpdateInventorySchema,
  ImportInventorySchema,
  ExportInventorySchema,
} from '../validators/inventory.validators';
import * as inventoryController from '../controllers/inventory.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply CSRF protection to state-changing routes
router.use(validateCsrfToken);

// ============================================
// INVENTORY ITEM ROUTES
// ============================================

// Get all inventory items (with filters, search, pagination)
router.get(
  '/inventory',
  validateRequest(GetInventoryQuerySchema, 'query'),
  checkPermission('TECHNOLOGY', 1), // At least level 1 access
  inventoryController.getInventory
);

// Get inventory statistics
router.get(
  '/inventory/stats',
  checkPermission('TECHNOLOGY', 1),
  inventoryController.getInventoryStats
);

// Get single inventory item by ID
router.get(
  '/inventory/:id',
  validateRequest(InventoryIdParamSchema, 'params'),
  checkPermission('TECHNOLOGY', 1),
  inventoryController.getInventoryItem
);

// Get inventory item history (audit trail)
router.get(
  '/inventory/:id/history',
  validateRequest(InventoryIdParamSchema, 'params'),
  checkPermission('TECHNOLOGY', 1),
  inventoryController.getInventoryHistory
);

// Create new inventory item
router.post(
  '/inventory',
  validateRequest(CreateInventorySchema, 'body'),
  checkPermission('TECHNOLOGY', 1),
  inventoryController.createInventoryItem
);

// Update inventory item
router.put(
  '/inventory/:id',
  validateRequest(InventoryIdParamSchema, 'params'),
  validateRequest(UpdateInventorySchema, 'body'),
  checkPermission('TECHNOLOGY', 1),
  inventoryController.updateInventoryItem
);

// Delete inventory item (soft delete)
router.delete(
  '/inventory/:id',
  validateRequest(InventoryIdParamSchema, 'params'),
  checkPermission('TECHNOLOGY', 1),
  inventoryController.deleteInventoryItem
);

// Bulk update inventory items
router.post(
  '/inventory/bulk-update',
  validateRequest(BulkUpdateInventorySchema, 'body'),
  checkPermission('TECHNOLOGY', 1),
  inventoryController.bulkUpdateInventory
);

// ============================================
// LOCATION-SPECIFIC ROUTES
// ============================================

// Get inventory for specific office location
router.get(
  '/locations/:locationId/inventory',
  validateRequest(GetInventoryQuerySchema, 'query'),
  checkPermission('TECHNOLOGY', 2),
  inventoryController.getInventoryByLocation
);

// Get inventory for specific room
router.get(
  '/rooms/:roomId/inventory',
  validateRequest(GetInventoryQuerySchema, 'query'),
  checkPermission('TECHNOLOGY', 2),
  inventoryController.getInventoryByRoom
);

// ============================================
// IMPORT/EXPORT ROUTES
// ============================================

// Import inventory from Excel
router.post(
  '/inventory/import',
  validateRequest(ImportInventorySchema, 'body'),
  checkPermission('TECHNOLOGY', 1), // Admin only
  inventoryController.importInventory
);

// Get import job status
router.get(
  '/inventory/import/:jobId',
  checkPermission('TECHNOLOGY', 1),
  inventoryController.getImportJobStatus
);

// Export inventory to Excel
router.post(
  '/inventory/export',
  validateRequest(ExportInventorySchema, 'body'),
  checkPermission('TECHNOLOGY', 1),
  inventoryController.exportInventory
);

// ============================================
// MAINTENANCE ROUTES
// ============================================

// Get maintenance history for equipment
router.get(
  '/inventory/:id/maintenance',
  validateRequest(InventoryIdParamSchema, 'params'),
  checkPermission('TECHNOLOGY', 2),
  inventoryController.getMaintenanceHistory
);

// Add maintenance record
router.post(
  '/inventory/:id/maintenance',
  validateRequest(InventoryIdParamSchema, 'params'),
  checkPermission('TECHNOLOGY', 2),
  inventoryController.addMaintenanceRecord
);

// ============================================
// ATTACHMENT ROUTES
// ============================================

// Upload attachment
router.post(
  '/inventory/:id/attachments',
  validateRequest(InventoryIdParamSchema, 'params'),
  checkPermission('TECHNOLOGY', 2),
  inventoryController.uploadAttachment
);

// Delete attachment
router.delete(
  '/inventory/:id/attachments/:attachmentId',
  checkPermission('TECHNOLOGY', 2),
  inventoryController.deleteAttachment
);

export default router;
```

### 2. Controller Layer

**File**: `backend/src/controllers/inventory.controller.ts`

```typescript
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { InventoryService } from '../services/inventory.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

// Instantiate service
const inventoryService = new InventoryService(prisma);

/**
 * Get inventory items with filters and pagination
 */
export const getInventory = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = '1',
      limit = '50',
      search,
      locationId,
      officeLocationId,
      categoryId,
      status,
      isDisposed,
      brandId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const query = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      search: search as string,
      locationId: locationId as string,
      officeLocationId: officeLocationId as string,
      categoryId: categoryId as string,
      status: status as string,
      isDisposed: isDisposed === 'true',
      brandId: brandId as string,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
    };

    const result = await inventoryService.findAll(query);
    
    logger.info('Inventory items retrieved', {
      userId: req.user?.id,
      count: result.items.length,
      total: result.total,
    });

    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Get inventory statistics
 */
export const getInventoryStats = async (req: AuthRequest, res: Response) => {
  try {
    const stats = await inventoryService.getStatistics();
    res.json(stats);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Get single inventory item with full details
 */
export const getInventoryItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const item = await inventoryService.findById(id);
    res.json(item);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Get inventory item change history
 */
export const getInventoryHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const history = await inventoryService.getHistory(id);
    res.json(history);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Create new inventory item
 */
export const createInventoryItem = async (req: AuthRequest, res: Response) => {
  try {
    const item = await inventoryService.create(req.body, req.user!);
    
    logger.info('Inventory item created', {
      userId: req.user?.id,
      itemId: item.id,
      assetTag: item.assetTag,
    });

    res.status(201).json(item);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Update inventory item
 */
export const updateInventoryItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const item = await inventoryService.update(id, req.body, req.user!);
    
    logger.info('Inventory item updated', {
      userId: req.user?.id,
      itemId: item.id,
      assetTag: item.assetTag,
    });

    res.json(item);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Delete inventory item (soft delete)
 */
export const deleteInventoryItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const permanent = req.query.permanent === 'true';

    if (permanent && req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Only administrators can permanently delete inventory items',
      });
    }

    await inventoryService.delete(id, permanent, req.user!);
    
    logger.warn('Inventory item deleted', {
      userId: req.user?.id,
      itemId: id,
      permanent,
    });

    res.json({ 
      message: permanent ? 'Item permanently deleted' : 'Item marked as disposed',
    });
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Bulk update inventory items
 */
export const bulkUpdateInventory = async (req: AuthRequest, res: Response) => {
  try {
    const { itemIds, updates } = req.body;
    const result = await inventoryService.bulkUpdate(itemIds, updates, req.user!);
    
    logger.info('Bulk inventory update', {
      userId: req.user?.id,
      count: result.updated,
    });

    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Get inventory by office location
 */
export const getInventoryByLocation = async (req: AuthRequest, res: Response) => {
  try {
    const { locationId } = req.params;
    const result = await inventoryService.findByLocation(locationId);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Get inventory by room
 */
export const getInventoryByRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const result = await inventoryService.findByRoom(roomId);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Import inventory from Excel file
 */
export const importInventory = async (req: AuthRequest, res: Response) => {
  try {
    const { fileData, fileName, options } = req.body;
    
    const job = await inventoryService.importFromExcel(
      fileData,
      fileName,
      options,
      req.user!
    );
    
    logger.info('Inventory import job started', {
      userId: req.user?.id,
      jobId: job.id,
      fileName,
    });

    res.status(202).json({
      message: 'Import job started',
      jobId: job.id,
    });
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Get import job status
 */
export const getImportJobStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await inventoryService.getImportJobStatus(jobId);
    res.json(job);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Export inventory to Excel
 */
export const exportInventory = async (req: AuthRequest, res: Response) => {
  try {
    const { format = 'xlsx', filters } = req.body;
    
    const fileBuffer = await inventoryService.exportToExcel(filters, format);
    
    const fileName = `inventory-export-${new Date().toISOString().split('T')[0]}.${format}`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(fileBuffer);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Get maintenance history for equipment
 */
export const getMaintenanceHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const history = await inventoryService.getMaintenanceHistory(id);
    res.json(history);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Add maintenance record
 */
export const addMaintenanceRecord = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const record = await inventoryService.addMaintenanceRecord(
      id,
      req.body,
      req.user!
    );
    
    logger.info('Maintenance record added', {
      userId: req.user?.id,
      equipmentId: id,
      recordId: record.id,
    });

    res.status(201).json(record);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Upload attachment
 */
export const uploadAttachment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    // File upload logic here (multer middleware required)
    // This is a placeholder
    res.status(501).json({ message: 'File upload not yet implemented' });
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Delete attachment
 */
export const deleteAttachment = async (req: AuthRequest, res: Response) => {
  try {
    const { id, attachmentId } = req.params;
    await inventoryService.deleteAttachment(id, attachmentId);
    res.json({ message: 'Attachment deleted' });
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

### 3. Service Layer

**File**: `backend/src/services/inventory.service.ts`

```typescript
import { PrismaClient, equipment, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../utils/errors';
import * as XLSX from 'xlsx';
import { JWTPayload } from '../middleware/auth';

/**
 * Query parameters for inventory search
 */
export interface InventoryQuery {
  page?: number;
  limit?: number;
  search?: string;
  locationId?: string;
  officeLocationId?: string;
  categoryId?: string;
  status?: string;
  isDisposed?: boolean;
  brandId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * DTO for creating inventory item
 */
export interface CreateInventoryDto {
  assetTag: string;
  serialNumber?: string;
  name: string;
  description?: string;
  brandId?: string;
  modelId?: string;
  locationId?: string;
  officeLocationId?: string;
  categoryId?: string;
  purchaseDate?: Date;
  purchasePrice?: number;
  fundingSource?: string;
  poNumber?: string;
  vendorId?: string;
  status?: string;
  condition?: string;
  notes?: string;
}

/**
 * DTO for updating inventory item
 */
export interface UpdateInventoryDto extends Partial<CreateInventoryDto> {
  isDisposed?: boolean;
  disposedDate?: Date;
  disposedReason?: string;
}

/**
 * Inventory item with relations
 */
export interface InventoryItemWithRelations extends equipment {
  brand?: { id: string; name: string } | null;
  model?: { id: string; name: string; modelNumber: string | null } | null;
  category?: { id: string; name: string } | null;
  location?: { id: string; buildingName: string; roomNumber: string } | null;
  officeLocation?: { id: string; name: string; type: string } | null;
  vendor?: { id: string; name: string } | null;
}

/**
 * Inventory Service
 * Handles all inventory management operations
 */
export class InventoryService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Find all inventory items with filters and pagination
   */
  async findAll(query: InventoryQuery) {
    const {
      page = 1,
      limit = 50,
      search,
      locationId,
      officeLocationId,
      categoryId,
      status,
      isDisposed,
      brandId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.equipmentWhereInput = {};

    if (search) {
      where.OR = [
        { assetTag: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { serialNumber: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (locationId) where.locationId = locationId;
    if (officeLocationId) where.officeLocationId = officeLocationId;
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status;
    if (isDisposed !== undefined) where.isDisposed = isDisposed;
    if (brandId) where.brandId = brandId;

    // Build order by clause
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    // Execute queries in parallel
    const [items, total] = await Promise.all([
      this.prisma.equipment.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          brands: { select: { id: true, name: true } },
          models: { select: { id: true, name: true, modelNumber: true } },
          categories: { select: { id: true, name: true } },
          locations: { select: { id: true, buildingName: true, roomNumber: true } },
          officeLocation: { select: { id: true, name: true, type: true } },
          vendors: { select: { id: true, name: true } },
        },
      }),
      this.prisma.equipment.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Find inventory item by ID
   */
  async findById(id: string): Promise<InventoryItemWithRelations> {
    const item = await this.prisma.equipment.findUnique({
      where: { id },
      include: {
        brands: true,
        models: true,
        categories: true,
        locations: true,
        officeLocation: true,
        vendors: true,
        inventory_changes: {
          take: 10,
          orderBy: { changedAt: 'desc' },
        },
      },
    });

    if (!item) {
      throw new NotFoundError('Inventory item', id);
    }

    return item as any;
  }

  /**
   * Get change history for inventory item
   */
  async getHistory(equipmentId: string) {
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: equipmentId },
    });

    if (!equipment) {
      throw new NotFoundError('Inventory item', equipmentId);
    }

    const changes = await this.prisma.inventory_changes.findMany({
      where: { equipmentId },
      orderBy: { changedAt: 'desc' },
    });

    return {
      equipmentId,
      assetTag: equipment.assetTag,
      changes,
      total: changes.length,
    };
  }

  /**
   * Create new inventory item
   */
  async create(
    data: CreateInventoryDto,
    user: JWTPayload
  ): Promise<InventoryItemWithRelations> {
    // Validate asset tag uniqueness
    const existing = await this.prisma.equipment.findUnique({
      where: { assetTag: data.assetTag },
    });

    if (existing) {
      throw new ValidationError(
        `Asset tag ${data.assetTag} already exists`,
        'assetTag'
      );
    }

    // Create equipment
    const equipment = await this.prisma.equipment.create({
      data: {
        assetTag: data.assetTag,
        serialNumber: data.serialNumber || null,
        name: data.name,
        description: data.description || null,
        brandId: data.brandId || null,
        modelId: data.modelId || null,
        locationId: data.locationId || null,
        officeLocationId: data.officeLocationId || null,
        categoryId: data.categoryId || null,
        purchaseDate: data.purchaseDate || null,
        purchasePrice: data.purchasePrice || null,
        fundingSource: data.fundingSource || null,
        poNumber: data.poNumber || null,
        vendorId: data.vendorId || null,
        status: data.status || 'active',
        condition: data.condition || null,
        notes: data.notes || null,
        isDisposed: false,
      },
      include: {
        brands: true,
        models: true,
        categories: true,
        locations: true,
        officeLocation: true,
        vendors: true,
      },
    });

    // Create audit trail entry
    await this.prisma.inventory_changes.create({
      data: {
        equipmentId: equipment.id,
        changeType: 'CREATE',
        fieldChanged: null,
        oldValue: null,
        newValue: `Created item: ${equipment.name}`,
        changedBy: user.id,
        changedByName: user.name,
        notes: 'Initial creation',
      },
    });

    return equipment as any;
  }

  /**
   * Update inventory item
   */
  async update(
    id: string,
    data: UpdateInventoryDto,
    user: JWTPayload
  ): Promise<InventoryItemWithRelations> {
    // Get existing item
    const existing = await this.prisma.equipment.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('Inventory item', id);
    }

    // Track changes for audit trail
    const changes: Array<{
      field: string;
      oldValue: string;
      newValue: string;
    }> = [];

    // Compare fields and track changes
    const fieldsToTrack = [
      'assetTag', 'serialNumber', 'name', 'description',
      'locationId', 'officeLocationId', 'status', 'condition',
      'purchasePrice', 'fundingSource', 'notes',
    ];

    fieldsToTrack.forEach((field) => {
      const oldVal = (existing as any)[field];
      const newVal = (data as any)[field];
      
      if (newVal !== undefined && newVal !== oldVal) {
        changes.push({
          field,
          oldValue: oldVal?.toString() || '',
          newValue: newVal?.toString() || '',
        });
      }
    });

    // Update equipment
    const updated = await this.prisma.equipment.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        brands: true,
        models: true,
        categories: true,
        locations: true,
        officeLocation: true,
        vendors: true,
      },
    });

    // Create audit trail entries
    for (const change of changes) {
      await this.prisma.inventory_changes.create({
        data: {
          equipmentId: id,
          changeType: 'UPDATE',
          fieldChanged: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          changedBy: user.id,
          changedByName: user.name,
        },
      });
    }

    return updated as any;
  }

  /**
   * Delete inventory item
   */
  async delete(id: string, permanent: boolean, user: JWTPayload) {
    const existing = await this.prisma.equipment.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('Inventory item', id);
    }

    if (permanent) {
      // Hard delete
      await this.prisma.equipment.delete({ where: { id } });
    } else {
      // Soft delete - mark as disposed
      await this.prisma.equipment.update({
        where: { id },
        data: {
          isDisposed: true,
          disposedDate: new Date(),
          status: 'disposed',
        },
      });

      // Create audit trail
      await this.prisma.inventory_changes.create({
        data: {
          equipmentId: id,
          changeType: 'DELETE',
          fieldChanged: 'isDisposed',
          oldValue: 'false',
          newValue: 'true',
          changedBy: user.id,
          changedByName: user.name,
          notes: 'Item marked as disposed',
        },
      });
    }
  }

  /**
   * Bulk update inventory items
   */
  async bulkUpdate(
    itemIds: string[],
    updates: Partial<UpdateInventoryDto>,
    user: JWTPayload
  ) {
    let updated = 0;
    const errors: string[] = [];

    for (const id of itemIds) {
      try {
        await this.update(id, updates, user);
        updated++;
      } catch (error: any) {
        errors.push(`${id}: ${error.message}`);
      }
    }

    return {
      total: itemIds.length,
      updated,
      failed: itemIds.length - updated,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get inventory statistics
   */
  async getStatistics() {
    const [
      totalItems,
      activeItems,
      disposedItems,
      byStatus,
      byCategory,
      byLocation,
      totalValue,
    ] = await Promise.all([
      this.prisma.equipment.count(),
      this.prisma.equipment.count({ where: { isDisposed: false, status: 'active' } }),
      this.prisma.equipment.count({ where: { isDisposed: true } }),
      this.prisma.equipment.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.equipment.groupBy({
        by: ['categoryId'],
        _count: true,
      }),
      this.prisma.equipment.groupBy({
        by: ['officeLocationId'],
        _count: true,
      }),
      this.prisma.equipment.aggregate({
        _sum: { purchasePrice: true },
        where: { isDisposed: false },
      }),
    ]);

    return {
      totalItems,
      activeItems,
      disposedItems,
      byStatus,
      byCategory: await this.enrichCategoryStats(byCategory),
      byLocation: await this.enrichLocationStats(byLocation),
      totalValue: totalValue._sum.purchasePrice || 0,
    };
  }

  /**
   * Helper to enrich category statistics with names
   */
  private async enrichCategoryStats(stats: any[]) {
    const categoryIds = stats.map((s) => s.categoryId).filter(Boolean);
    const categories = await this.prisma.categories.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    return stats.map((s) => ({
      categoryId: s.categoryId,
      categoryName: s.categoryId ? categoryMap.get(s.categoryId) : 'Uncategorized',
      count: s._count,
    }));
  }

  /**
   * Helper to enrich location statistics with names
   */
  private async enrichLocationStats(stats: any[]) {
    const locationIds = stats.map((s) => s.officeLocationId).filter(Boolean);
    const locations = await this.prisma.officeLocation.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, name: true },
    });

    const locationMap = new Map(locations.map((l) => [l.id, l.name]));

    return stats.map((s) => ({
      locationId: s.officeLocationId,
      locationName: s.officeLocationId ? locationMap.get(s.officeLocationId) : 'Unassigned',
      count: s._count,
    }));
  }

  /**
   * Find inventory by office location
   */
  async findByLocation(locationId: string) {
    const location = await this.prisma.officeLocation.findUnique({
      where: { id: locationId },
    });

    if (!location) {
      throw new NotFoundError('Office location', locationId);
    }

    const items = await this.prisma.equipment.findMany({
      where: { officeLocationId: locationId },
      include: {
        brands: { select: { id: true, name: true } },
        categories: { select: { id: true, name: true } },
        locations: { select: { id: true, buildingName: true, roomNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      location,
      items,
      total: items.length,
    };
  }

  /**
   * Find inventory by room
   */
  async findByRoom(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { location: true },
    });

    if (!room) {
      throw new NotFoundError('Room', roomId);
    }

    const items = await this.prisma.equipment.findMany({
      where: { locationId: roomId },
      include: {
        brands: { select: { id: true, name: true } },
        categories: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      room,
      items,
      total: items.length,
    };
  }

  /**
   * Import inventory from Excel
   */
  async importFromExcel(
    fileData: any,
    fileName: string,
    options: any,
    user: JWTPayload
  ) {
    // Create import job
    const job = await this.prisma.inventoryImportJob.create({
      data: {
        fileName,
        status: 'pending',
        totalRows: 0,
        importedBy: user.id,
      },
    });

    // Process import asynchronously
    this.processImport(job.id, fileData, options, user).catch((error) => {
      console.error('Import failed:', error);
    });

    return job;
  }

  /**
   * Process Excel import (background job)
   */
  private async processImport(
    jobId: string,
    fileData: any,
    options: any,
    user: JWTPayload
  ) {
    try {
      // Update job status
      await this.prisma.inventoryImportJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      // Parse Excel file (placeholder - actual implementation needed)
      // const workbook = XLSX.read(fileData, { type: 'buffer' });
      // const sheet = workbook.Sheets[workbook.SheetNames[0]];
      // const rows = XLSX.utils.sheet_to_json(sheet);

      // Process each row...

      // Update job as completed
      await this.prisma.inventoryImportJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });
    } catch (error: any) {
      // Update job as failed
      await this.prisma.inventoryImportJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          errors: { message: error.message },
          completedAt: new Date(),
        },
      });
    }
  }

  /**
   * Get import job status
   */
  async getImportJobStatus(jobId: string) {
    const job = await this.prisma.inventoryImportJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundError('Import job', jobId);
    }

    return job;
  }

  /**
   * Export inventory to Excel
   */
  async exportToExcel(filters: any, format: string) {
    // Query items based on filters
    const items = await this.prisma.equipment.findMany({
      include: {
        brands: true,
        models: true,
        categories: true,
        locations: true,
        officeLocation: true,
        vendors: true,
      },
    });

    // Convert to Excel format (placeholder - actual implementation needed)
    // const worksheet = XLSX.utils.json_to_sheet(items);
    // const workbook = XLSX.utils.book_new();
    // XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');
    // const buffer = XLSX.write(workbook, { type: 'buffer', bookType: format });

    // return buffer;
    return Buffer.from('placeholder');
  }

  /**
   * Get maintenance history
   */
  async getMaintenanceHistory(equipmentId: string) {
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: equipmentId },
    });

    if (!equipment) {
      throw new NotFoundError('Equipment', equipmentId);
    }

    // Placeholder - requires MaintenanceHistory model
    return [];
  }

  /**
   * Add maintenance record
   */
  async addMaintenanceRecord(
    equipmentId: string,
    data: any,
    user: JWTPayload
  ) {
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: equipmentId },
    });

    if (!equipment) {
      throw new NotFoundError('Equipment', equipmentId);
    }

    // Placeholder - requires MaintenanceHistory model
    return {};
  }

  /**
   * Delete attachment
   */
  async deleteAttachment(equipmentId: string, attachmentId: string) {
    // Placeholder - requires EquipmentAttachment model
    return;
  }
}
```

### 4. Validators

**File**: `backend/src/validators/inventory.validators.ts`

```typescript
import { z } from 'zod';

/**
 * Equipment status enum
 */
const EquipmentStatus = z.enum([
  'active',
  'available',
  'maintenance',
  'storage',
  'disposed',
  'lost',
  'damaged',
  'reserved',
]);

/**
 * Equipment condition enum
 */
const EquipmentCondition = z.enum([
  'excellent',
  'good',
  'fair',
  'poor',
  'broken',
]);

/**
 * Inventory ID parameter validation
 */
export const InventoryIdParamSchema = z.object({
  id: z.string().uuid('Invalid inventory ID format'),
});

/**
 * Get inventory query parameters
 */
export const GetInventoryQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().transform(Number),
  limit: z.string().regex(/^\d+$/).optional().transform(Number),
  search: z.string().optional(),
  locationId: z.string().uuid().optional(),
  officeLocationId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  status: EquipmentStatus.optional(),
  isDisposed: z.string().optional().transform((val) => val === 'true'),
  brandId: z.string().uuid().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

/**
 * Create inventory item schema
 */
export const CreateInventorySchema = z.object({
  assetTag: z.string().min(1, 'Asset tag is required').max(100),
  serialNumber: z.string().max(200).optional().nullable(),
  name: z.string().min(1, 'Name is required').max(500),
  description: z.string().max(2000).optional().nullable(),
  brandId: z.string().uuid('Invalid brand ID').optional().nullable(),
  modelId: z.string().uuid('Invalid model ID').optional().nullable(),
  locationId: z.string().uuid('Invalid location ID').optional().nullable(),
  officeLocationId: z.string().uuid('Invalid office location ID').optional().nullable(),
  categoryId: z.string().uuid('Invalid category ID').optional().nullable(),
  purchaseDate: z.string().datetime().optional().nullable(),
  purchasePrice: z.number().min(0).optional().nullable(),
  fundingSource: z.string().max(200).optional().nullable(),
  poNumber: z.string().max(100).optional().nullable(),
  vendorId: z.string().uuid('Invalid vendor ID').optional().nullable(),
  status: EquipmentStatus.optional(),
  condition: EquipmentCondition.optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

/**
 * Update inventory item schema
 */
export const UpdateInventorySchema = CreateInventorySchema.partial().extend({
  isDisposed: z.boolean().optional(),
  disposedDate: z.string().datetime().optional().nullable(),
  disposedReason: z.string().max(500).optional().nullable(),
});

/**
 * Bulk update schema
 */
export const BulkUpdateInventorySchema = z.object({
  itemIds: z.array(z.string().uuid()),
  updates: UpdateInventorySchema,
});

/**
 * Import inventory schema
 */
export const ImportInventorySchema = z.object({
  fileData: z.any(), // Base64 or buffer
  fileName: z.string(),
  options: z.object({
    updateExisting: z.boolean().optional(),
    skipErrors: z.boolean().optional(),
  }).optional(),
});

/**
 * Export inventory schema
 */
export const ExportInventorySchema = z.object({
  format: z.enum(['xlsx', 'csv', 'pdf']).default('xlsx'),
  filters: GetInventoryQuerySchema.optional(),
});

// Type exports
export type InventoryIdParam = z.infer<typeof InventoryIdParamSchema>;
export type GetInventoryQuery = z.infer<typeof GetInventoryQuerySchema>;
export type CreateInventory = z.infer<typeof CreateInventorySchema>;
export type UpdateInventory = z.infer<typeof UpdateInventorySchema>;
export type BulkUpdateInventory = z.infer<typeof BulkUpdateInventorySchema>;
```

### 5. Middleware Enhancement

**File**: `backend/src/middleware/permissions.ts` (NEW)

```typescript
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

/**
 * Permission check middleware
 * Validates user has required permission level for a module
 */
export const checkPermission = (module: string, requiredLevel: number) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // ADMIN always has access
    if (user.roles?.includes('ADMIN')) {
      return next();
    }

    // Check user permissions (placeholder - requires permission service)
    // const hasPermission = await checkUserPermission(user.id, module, requiredLevel);

    // For now, grant access to MANAGER and above
    if (user.roles?.includes('MANAGER') || user.roles?.includes('ADMIN')) {
      return next();
    }

    return res.status(403).json({
      error: 'Insufficient permissions',
      required: `${module} Level ${requiredLevel}`,
    });
  };
};
```

---

## Frontend Architecture

### 1. Pages

#### Inventory List Page

**File**: `frontend/src/pages/InventoryManagement.tsx`

```tsx
import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  Grid,
  TextField,
  MenuItem,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  History as HistoryIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import inventoryService from '../services/inventory.service';
import { InventoryItem, InventoryFilters } from '../types/inventory.types';
import InventoryFormModal from '../components/inventory/InventoryFormModal';
import InventoryHistory from '../components/inventory/InventoryHistoryModal';
import ImportInventoryModal from '../components/inventory/ImportInventoryModal';
import './InventoryManagement.css';

export const InventoryManagement = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  // Modal states
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  // Filter state
  const [filters, setFilters] = useState<InventoryFilters>({
    search: '',
    status: '',
    locationId: '',
    categoryId: '',
    isDisposed: false,
  });

  // Stats
  const [stats, setStats] = useState({
    totalItems: 0,
    activeItems: 0,
    totalValue: 0,
  });

  useEffect(() => {
    fetchInventory();
  }, [page, pageSize, filters]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const response = await inventoryService.getInventory({
        page: page + 1,
        limit: pageSize,
        ...filters,
      });
      setItems(response.items);
      setTotal(response.total);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch inventory');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const statsData = await inventoryService.getStats();
      setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const handleCreate = () => {
    setSelectedItem(null);
    setFormModalOpen(true);
  };

  const handleEdit = (item: InventoryItem) => {
    setSelectedItem(item);
    setFormModalOpen(true);
  };

  const handleDelete = async (item: InventoryItem) => {
    if (!window.confirm(`Mark "${item.name}" as disposed?`)) {
      return;
    }

    try {
      await inventoryService.deleteItem(item.id);
      fetchInventory();
      fetchStats();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete item');
    }
  };

  const handleViewHistory = (item: InventoryItem) => {
    setSelectedItem(item);
    setHistoryModalOpen(true);
  };

  const handleExport = async () => {
    try {
      await inventoryService.exportInventory({ format: 'xlsx', filters });
    } catch (err: any) {
      alert('Export failed: ' + err.message);
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'assetTag',
      headerName: 'Asset Tag',
      width: 120,
      renderCell: (params) => (
        <Typography variant="body2" fontWeight="bold">
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'name',
      headerName: 'Item Name',
      width: 250,
      flex: 1,
    },
    {
      field: 'category',
      headerName: 'Category',
      width: 150,
      valueGetter: (params) => params.row.category?.name || 'N/A',
    },
    {
      field: 'brand',
      headerName: 'Brand',
      width: 130,
      valueGetter: (params) => params.row.brand?.name || 'N/A',
    },
    {
      field: 'location',
      headerName: 'Location',
      width: 180,
      valueGetter: (params) => params.row.officeLocation?.name || 'Unassigned',
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      renderCell: (params) => (
        <Chip
          label={params.value}
          size="small"
          color={getStatusColor(params.value)}
        />
      ),
    },
    {
      field: 'purchasePrice',
      headerName: 'Value',
      width: 110,
      valueFormatter: (params) =>
        params.value ? `$${parseFloat(params.value).toFixed(2)}` : 'N/A',
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      sortable: false,
      renderCell: (params) => (
        <Box>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => handleEdit(params.row)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="History">
            <IconButton size="small" onClick={() => handleViewHistory(params.row)}>
              <HistoryIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" onClick={() => handleDelete(params.row)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  const getStatusColor = (status: string): any => {
    const colorMap: Record<string, any> = {
      active: 'success',
      maintenance: 'warning',
      disposed: 'error',
      storage: 'default',
    };
    return colorMap[status] || 'default';
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <Typography variant="h4" gutterBottom>
            Inventory Management
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage all equipment and assets
          </Typography>
        </div>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={() => setImportModalOpen(true)}
          >
            Import
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
          >
            Export
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreate}
          >
            Add Item
          </Button>
        </Box>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ p: 2 }}>
            <Typography variant="h6" color="text.secondary">
              Total Items
            </Typography>
            <Typography variant="h3">{stats.totalItems}</Typography>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ p: 2 }}>
            <Typography variant="h6" color="text.secondary">
              Active
            </Typography>
            <Typography variant="h3">{stats.activeItems}</Typography>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ p: 2 }}>
            <Typography variant="h6" color="text.secondary">
              Total Value
            </Typography>
            <Typography variant="h3">
              ${stats.totalValue.toLocaleString()}
            </Typography>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              label="Search"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Asset tag, name, serial..."
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              select
              label="Status"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="maintenance">Maintenance</MenuItem>
              <MenuItem value="storage">Storage</MenuItem>
              <MenuItem value="disposed">Disposed</MenuItem>
            </TextField>
          </Grid>
          {/* Add more filter fields */}
        </Grid>
      </Card>

      {/* Data Grid */}
      <Card>
        <DataGrid
          rows={items}
          columns={columns}
          loading={loading}
          rowCount={total}
          paginationMode="server"
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
          autoHeight
        />
      </Card>

      {/* Modals */}
      <InventoryFormModal
        open={formModalOpen}
        item={selectedItem}
        onClose={() => setFormModalOpen(false)}
        onSuccess={() => {
          fetchInventory();
          fetchStats();
        }}
      />

      <InventoryHistory
        open={historyModalOpen}
        item={selectedItem}
        onClose={() => setHistoryModalOpen(false)}
      />

      <ImportInventoryModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => {
          fetchInventory();
          fetchStats();
        }}
      />
    </Box>
  );
};

export default InventoryManagement;
```

### 2. Components

#### Inventory Form Modal

**File**: `frontend/src/components/inventory/InventoryFormModal.tsx`

```tsx
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import inventoryService from '../../services/inventory.service';
import { InventoryItem, CreateInventoryRequest } from '../../types/inventory.types';

interface InventoryFormModalProps {
  open: boolean;
  item: InventoryItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const InventoryFormModal = ({
  open,
  item,
  onClose,
  onSuccess,
}: InventoryFormModalProps) => {
  const [formData, setFormData] = useState<CreateInventoryRequest>({
    assetTag: '',
    name: '',
    serialNumber: '',
    description: '',
    status: 'active',
    condition: 'good',
    purchasePrice: 0,
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setFormData({
        assetTag: item.assetTag,
        name: item.name,
        serialNumber: item.serialNumber || '',
        description: item.description || '',
        status: item.status,
        condition: item.condition || 'good',
        purchasePrice: item.purchasePrice || 0,
        notes: item.notes || '',
      });
    } else {
      // Reset for new item
      setFormData({
        assetTag: '',
        name: '',
        serialNumber: '',
        description: '',
        status: 'active',
        condition: 'good',
        purchasePrice: 0,
        notes: '',
      });
    }
  }, [item, open]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      if (item) {
        await inventoryService.updateItem(item.id, formData);
      } else {
        await inventoryService.createItem(formData);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{item ? 'Edit Inventory Item' : 'Add Inventory Item'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              required
              label="Asset Tag"
              value={formData.assetTag}
              onChange={(e) => setFormData({ ...formData, assetTag: e.target.value })}
              disabled={!!item} // Don't allow changing asset tag
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Serial Number"
              value={formData.serialNumber}
              onChange={(e) =>
                setFormData({ ...formData, serialNumber: e.target.value })
              }
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              label="Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={formData.status}
                label="Status"
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="available">Available</MenuItem>
                <MenuItem value="maintenance">Maintenance</MenuItem>
                <MenuItem value="storage">Storage</MenuItem>
                <MenuItem value="disposed">Disposed</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Condition</InputLabel>
              <Select
                value={formData.condition}
                label="Condition"
                onChange={(e) =>
                  setFormData({ ...formData, condition: e.target.value })
                }
              >
                <MenuItem value="excellent">Excellent</MenuItem>
                <MenuItem value="good">Good</MenuItem>
                <MenuItem value="fair">Fair</MenuItem>
                <MenuItem value="poor">Poor</MenuItem>
                <MenuItem value="broken">Broken</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              type="number"
              label="Purchase Price"
              value={formData.purchasePrice}
              onChange={(e) =>
                setFormData({ ...formData, purchasePrice: parseFloat(e.target.value) })
              }
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </Grid>
        </Grid>
        {error && (
          <Typography color="error" sx={{ mt: 2 }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading}>
          {loading ? 'Saving...' : item ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default InventoryFormModal;
```

### 3. Services

**File**: `frontend/src/services/inventory.service.ts`

```typescript
import axios from 'axios';
import {
  InventoryItem,
  InventoryFilters,
  CreateInventoryRequest,
  UpdateInventoryRequest,
  InventoryStats,
} from '../types/inventory.types';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

class InventoryService {
  /**
   * Get inventory items with filters
   */
  async getInventory(filters: InventoryFilters) {
    const response = await axios.get(`${API_BASE}/inventory`, {
      params: filters,
      withCredentials: true,
    });
    return response.data;
  }

  /**
   * Get inventory statistics
   */
  async getStats(): Promise<InventoryStats> {
    const response = await axios.get(`${API_BASE}/inventory/stats`, {
      withCredentials: true,
    });
    return response.data;
  }

  /**
   * Get single inventory item
   */
  async getItem(id: string): Promise<InventoryItem> {
    const response = await axios.get(`${API_BASE}/inventory/${id}`, {
      withCredentials: true,
    });
    return response.data;
  }

  /**
   * Get item history
   */
  async getHistory(id: string) {
    const response = await axios.get(`${API_BASE}/inventory/${id}/history`, {
      withCredentials: true,
    });
    return response.data;
  }

  /**
   * Create inventory item
   */
  async createItem(data: CreateInventoryRequest): Promise<InventoryItem> {
    const response = await axios.post(`${API_BASE}/inventory`, data, {
      withCredentials: true,
    });
    return response.data;
  }

  /**
   * Update inventory item
   */
  async updateItem(
    id: string,
    data: UpdateInventoryRequest
  ): Promise<InventoryItem> {
    const response = await axios.put(`${API_BASE}/inventory/${id}`, data, {
      withCredentials: true,
    });
    return response.data;
  }

  /**
   * Delete inventory item
   */
  async deleteItem(id: string, permanent: boolean = false) {
    const response = await axios.delete(`${API_BASE}/inventory/${id}`, {
      params: { permanent },
      withCredentials: true,
    });
    return response.data;
  }

  /**
   * Export inventory
   */
  async exportInventory(options: { format: string; filters?: InventoryFilters }) {
    const response = await axios.post(
      `${API_BASE}/inventory/export`,
      options,
      {
        withCredentials: true,
        responseType: 'blob',
      }
    );

    // Trigger download
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `inventory-export.${options.format}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /**
   * Import inventory from file
   */
  async importInventory(file: File, options: any) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('options', JSON.stringify(options));

    const response = await axios.post(
      `${API_BASE}/inventory/import`,
      formData,
      {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data;
  }
}

export default new InventoryService();
```

### 4. Types

**File**: `frontend/src/types/inventory.types.ts`

```typescript
export interface InventoryItem {
  id: string;
  assetTag: string;
  serialNumber?: string;
  name: string;
  description?: string;
  brandId?: string;
  modelId?: string;
  locationId?: string;
  officeLocationId?: string;
  categoryId?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  fundingSource?: string;
  poNumber?: string;
  vendorId?: string;
  status: string;
  condition?: string;
  isDisposed: boolean;
  disposedDate?: string;
  disposedReason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;

  // Relations
  brand?: { id: string; name: string };
  model?: { id: string; name: string; modelNumber?: string };
  category?: { id: string; name: string };
  location?: { id: string; buildingName: string; roomNumber: string };
  officeLocation?: { id: string; name: string; type: string };
  vendor?: { id: string; name: string };
}

export interface InventoryFilters {
  page?: number;
  limit?: number;
  search?: string;
  locationId?: string;
  officeLocationId?: string;
  categoryId?: string;
  status?: string;
  isDisposed?: boolean;
  brandId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateInventoryRequest {
  assetTag: string;
  serialNumber?: string;
  name: string;
  description?: string;
  brandId?: string;
  modelId?: string;
  locationId?: string;
  officeLocationId?: string;
  categoryId?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  fundingSource?: string;
  poNumber?: string;
  vendorId?: string;
  status?: string;
  condition?: string;
  notes?: string;
}

export interface UpdateInventoryRequest extends Partial<CreateInventoryRequest> {
  isDisposed?: boolean;
  disposedDate?: string;
  disposedReason?: string;
}

export interface InventoryStats {
  totalItems: number;
  activeItems: number;
  disposedItems: number;
  totalValue: number;
  byStatus: Array<{ status: string; count: number }>;
  byCategory: Array<{ categoryId: string; categoryName: string; count: number }>;
  byLocation: Array<{ locationId: string; locationName: string; count: number }>;
}
```

---

## Import/Export Functionality

### Excel Import Process

1. **Upload**: User uploads Excel file via ImportInventoryModal
2. **Validation**: Backend validates file structure and data
3. **Preview**: Show preview of data to be imported with errors highlighted
4. **Mapping**: Map Excel columns to database fields
5. **Processing**: Create background job to process import
6. **Progress**: Poll job status and show progress
7. **Completion**: Display summary of imported/failed records

### Excel Column Mapping

| Excel Column | Database Field | Transformation |
|-------------|----------------|----------------|
| School | officeLocationId | Lookup OfficeLocation by name |
| Room | locationId | Lookup or create Room |
| Tag# | assetTag | Convert to string |
| Type | categoryId | Lookup or create Category |
| Brand | brandId | Lookup or create Brand |
| Model Number | modelId | Lookup or create Model |
| Serial Number | serialNumber | Direct mapping |
| PO# | poNumber | Convert to string |
| Vendor | vendorId | Lookup or create Vendor |
| Price | purchasePrice | Convert to Decimal |
| Funds | fundingSource | Direct mapping |
| Purchase Date | purchaseDate | Parse date (handle "0000-00-00") |
| Disposal Date | disposedDate | Parse date, set isDisposed flag |

### Export Formats

**Excel (.xlsx)**:
- All inventory fields
- Formatted columns with headers
- Multiple sheets (Summary, Details, By Location)

**CSV (.csv)**:
- Flat file format
- All fields comma-separated
- UTF-8 encoding

**PDF (.pdf)**:
- Professional report format
- Summary statistics
- Detailed inventory list
- Charts and graphs (future phase)

---

## Security & Permissions

### Authentication
- **Method**: JWT tokens in HttpOnly cookies
- **Provider**: Microsoft Entra ID (Azure AD)
- **Token Expiry**: 24 hours (configurable)
- **Refresh Token**: 7 days (auto-refresh)

### Authorization

**Role-Based Access Control (RBAC)**:

| Role | Create | Read | Update | Delete | Import/Export | Admin |
|------|--------|------|--------|--------|---------------|-------|
| ADMIN | ✅ | ✅ | ✅ | ✅ (Hard) | ✅ | ✅ |
| MANAGER | ✅ | ✅ | ✅ (Location) | ✅ (Soft) | ✅ | ❌ |
| TECHNICIAN | ❌ | ✅ | ✅ (Status) | ❌ | ❌ | ❌ |
| VIEWER | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

**Permission Checks**:
- All inventory routes require authentication
- Permission middleware validates module + level access
- Location-based filtering for MANAGER role
- Field-level restrictions (e.g., TECHNICIAN can only update status)

### CSRF Protection
- **Pattern**: Double Submit Cookie
- **Implementation**: 
  - Token generated on login
  - Sent in cookie and response header
  - Required in custom header for all POST/PUT/DELETE
  - Validated server-side via middleware

### Input Validation
- **Library**: Zod schemas
- **Validation Points**:
  - Route-level validation middleware
  - Database constraints (Prisma schema)
  - File upload validation (MIME type, size)
- **Sanitization**:
  - XSS prevention via React (automatic escaping)
  - SQL injection prevention via Prisma ORM
  - File name sanitization

### Secure Logging
- **Audit Trail**: All CRUD operations logged
- **PII Protection**: No passwords or sensitive data in logs
- **User Attribution**: User ID and name for all changes
- **Change Tracking**: Old/new values for updates
- **Log Level**: info, warn, error appropriately

### Data Integrity
- **Unique Constraints**: Asset tags, serial numbers (optional)
- **Foreign Key Constraints**: All relations validated
- **Soft Delete**: Default behavior (preserve data)
- **Transaction Support**: Critical operations wrapped in transactions

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
**Goal**: Database schema and basic CRUD

**Backend**:
- [ ] Update Prisma schema with new fields
- [ ] Run migrations for schema changes
- [ ] Create inventory routes
- [ ] Implement inventory controller (basic CRUD)
- [ ] Implement inventory service (basic operations)
- [ ] Create Zod validators
- [ ] Add unit tests

**Frontend**:
- [ ] Create inventory types
- [ ] Create inventory service
- [ ] Implement InventoryManagement page
- [ ] Implement InventoryFormModal component
- [ ] Add routing for inventory pages

**Testing**:
- [ ] Unit tests for service layer
- [ ] Integration tests for API endpoints
- [ ] Manual testing of CRUD operations

### Phase 2: Search & Filtering (Week 2)
**Goal**: Advanced search and filtering capabilities

**Backend**:
- [ ] Implement full-text search
- [ ] Add advanced filtering logic
- [ ] Optimize database queries (indexes)
- [ ] Implement pagination
- [ ] Add sorting functionality

**Frontend**:
- [ ] Implement filter UI components
- [ ] Add search with debouncing
- [ ] Implement pagination controls
- [ ] Add sorting to data grid
- [ ] Saved filter functionality

**Testing**:
- [ ] Performance testing with large datasets
- [ ] Filter combination testing

### Phase 3: Audit Trail & History (Week 2)
**Goal**: Complete audit trail system

**Backend**:
- [ ] Enhance inventory_changes tracking
- [ ] Implement history service methods
- [ ] Add history API endpoints

**Frontend**:
- [ ] Create InventoryHistoryModal component
- [ ] Implement change visualization
- [ ] Add filter/search for history

**Testing**:
- [ ] Verify all changes are tracked
- [ ] Test history retrieval performance

### Phase 4: Import Functionality (Week 3)
**Goal**: Excel import with validation

**Backend**:
- [ ] Implement Excel parsing (xlsx library)
- [ ] Create import job system
- [ ] Implement column mapping logic
- [ ] Add validation and error reporting
- [ ] Create location/brand/vendor lookup/create logic
- [ ] Implement background processing

**Frontend**:
- [ ] Create ImportInventoryModal component
- [ ] Implement file upload UI
- [ ] Add import preview with validation
- [ ] Implement progress tracking
- [ ] Display import results/errors

**Testing**:
- [ ] Test with actual inventory Excel file
- [ ] Test error handling (invalid data)
- [ ] Test performance (9000+ rows)

### Phase 5: Export Functionality (Week 3)
**Goal**: Multi-format export

**Backend**:
- [ ] Implement Excel export (xlsx library)
- [ ] Implement CSV export
- [ ] Add filtering to export
- [ ] Optimize for large datasets

**Frontend**:
- [ ] Add export button with format selection
- [ ] Implement download handling
- [ ] Add export progress indicator

**Testing**:
- [ ] Test all export formats
- [ ] Verify data accuracy
- [ ] Test with filters applied

### Phase 6: Reports & Analytics (Week 4)
**Goal**: Statistics and reporting

**Backend**:
- [ ] Implement statistics aggregation
- [ ] Create report generation endpoints
- [ ] Add location-based reports
- [ ] Add category-based reports
- [ ] Add value/financial reports

**Frontend**:
- [ ] Create dashboard with stats cards
- [ ] Implement charts (Chart.js or Recharts)
- [ ] Add report generation UI
- [ ] Create printable report views

**Testing**:
- [ ] Verify statistics accuracy
- [ ] Test report generation performance

### Phase 7: Advanced Features (Week 5)
**Goal**: Attachments, maintenance tracking, enhancements

**Backend**:
- [ ] Implement file upload (multer)
- [ ] Create attachment storage (local or S3)
- [ ] Implement maintenance history
- [ ] Add maintenance reminders
- [ ] Implement bulk operations

**Frontend**:
- [ ] Add attachment upload UI
- [ ] Display attachments in detail view
- [ ] Add maintenance history UI
- [ ] Implement bulk edit functionality

**Testing**:
- [ ] Test file upload and storage
- [ ] Test attachment deletion
- [ ] Test bulk operations

### Phase 8: Polish & Optimization (Week 6)
**Goal**: Performance, UX, and production readiness

**Tasks**:
- [ ] Performance optimization (query tuning)
- [ ] Add loading states and skeletons
- [ ] Implement error boundaries
- [ ] Add user feedback (toasts, alerts)
- [ ] Mobile responsive testing
- [ ] Accessibility audit (WCAG compliance)
- [ ] Security review
- [ ] Code review and refactoring
- [ ] Documentation updates
- [ ] User acceptance testing

**Testing**:
- [ ] Load testing (50+ concurrent users)
- [ ] End-to-end testing (Cypress/Playwright)
- [ ] Cross-browser testing
- [ ] Mobile device testing

---

## Integration Points

### 1. Office Locations
**Integration**: Inventory items linked to OfficeLocation table

**Use Cases**:
- View all inventory at a specific location
- Transfer items between locations
- Location-based access control for MANAGER role

**Implementation**:
- Add officeLocationId to equipment model
- Create location-specific inventory endpoints
- Add location filter to inventory list

### 2. Rooms
**Integration**: Inventory items linked to Room table (locations table)

**Use Cases**:
- Assign items to specific rooms
- Room-level inventory tracking
- Location hierarchy (OfficeLocation → Room → Equipment)

**Implementation**:
- Use existing locationId field in equipment
- Create room-specific inventory endpoints
- Display room info in inventory details

### 3. Users
**Integration**: Equipment assignment, audit trail

**Use Cases**:
- Assign equipment to specific users
- Track who made changes (audit trail)
- User-based equipment responsibility

**Implementation**:
- Add assignedToUserId to equipment model
- Link inventory_changes to User
- Display assigned user in inventory details

### 4. Purchase Orders
**Integration**: Link inventory items to purchase orders

**Use Cases**:
- Track which PO purchased which equipment
- View equipment purchased on a specific PO
- Financial tracking and reporting

**Implementation**:
- Add poNumber field to equipment (string reference)
- Create lookup from PO to equipment
- Display PO details in inventory view

### 5. Maintenance Orders
**Integration**: Track maintenance work on equipment

**Use Cases**:
- Link maintenance tickets to equipment
- View maintenance history for equipment
- Schedule preventive maintenance

**Implementation**:
- Enhance maintenance_orders table
- Add equipmentId reference
- Create maintenance history views

### 6. Vendors
**Integration**: Track equipment suppliers

**Use Cases**:
- View all equipment from a vendor
- Vendor contact info for warranty claims
- Vendor performance reporting

**Implementation**:
- Add vendorId to equipment model
- Create vendor-specific equipment endpoints
- Display vendor info in equipment details

### 7. Brands & Models
**Integration**: Equipment categorization

**Use Cases**:
- Standardize brand/model information
- Track equipment by manufacturer
- Model-specific specifications

**Implementation**:
- Use existing brandId and modelId
- Ensure consistent brand/model data
- Import process creates brands/models as needed

### 8. Categories
**Integration**: Equipment classification

**Use Cases**:
- Hierarchical equipment categorization
- Category-based filtering and reports
- Asset type management

**Implementation**:
- Use existing categoryId with hierarchical support
- Create category management UI
- Import process maps Type → Category

---

## Testing Strategy

### Unit Tests

**Backend**:
- Service layer methods (CRUD operations)
- Validation schemas (Zod)
- Utility functions (date parsing, mapping)
- Error handling

**Tools**: Jest, ts-jest

**Coverage Target**: 80%+

### Integration Tests

**API Endpoints**:
- All inventory routes (CRUD)
- Authentication and authorization
- Import/export functionality
- Error scenarios (404, 400, 403)

**Tools**: Supertest, Jest

**Test Database**: Separate test PostgreSQL instance

### End-to-End Tests

**User Flows**:
- Create inventory item
- Search and filter inventory
- Update item details
- View history
- Import Excel file
- Export inventory

**Tools**: Cypress or Playwright

**Target**: Critical paths covered

### Performance Tests

**Load Testing**:
- 50 concurrent users
- 10,000+ inventory items
- Search and filter performance
- Import/export with large datasets

**Tools**: Artillery, k6

**Metrics**:
- Response time < 2s for list queries
- Import processing < 30s for 10k rows

### Security Tests

**Checks**:
- Authentication bypass attempts
- Authorization violations
- CSRF token validation
- SQL injection attempts
- XSS vulnerabilities

**Tools**: Manual testing, OWASP ZAP

---

## Best Practices Research

Based on industry standards and best practices for inventory management systems, the following principles have been incorporated into this specification:

### 1. **Data Integrity & Audit Trails**

**Source**: NIST Cybersecurity Framework, ITIL Asset Management

**Principles Applied**:
- Complete audit trail (inventory_changes table) tracks all modifications
- User attribution for accountability
- Soft delete by default to prevent accidental data loss
- Immutable audit logs (append-only)
- Transaction support for critical operations

**Implementation**:
- Every CRUD operation logs changes with old/new values
- User ID and name recorded for all changes
- Timestamp tracking (createdAt, updatedAt, changedAt)
- Cascading deletes on relations to maintain referential integrity

### 2. **Asset Lifecycle Management**

**Source**: ITIL Service Asset & Configuration Management (SACM)

**Lifecycle Stages**:
1. **Acquisition**: Purchase order tracking, vendor information
2. **Deployment**: Location assignment, user assignment
3. **Operation**: Status tracking, condition monitoring
4. **Maintenance**: Service history, repair records
5. **Disposal**: Disposal reason, disposal date, decommissioning

**Implementation**:
- Status field tracks lifecycle stage (available, active, maintenance, disposed)
- Condition field tracks asset health
- Purchase information (PO, vendor, price, date)
- Maintenance history tracking
- Disposal workflow with reason tracking

### 3. **Hierarchical Location Management**

**Source**: ISO 55000 Asset Management Standards

**Hierarchy**:
```
Organization
  └─ Office Location (School/Building)
      └─ Room/Department
          └─ Equipment Item
```

**Benefits**:
- Precise location tracking
- Multi-level reporting (by building, by room)
- Location-based access control
- Transfer tracking between locations

**Implementation**:
- Two-level location system (officeLocationId, locationId)
- Location history in audit trail
- Location-based filtering and reports

### 4. **Flexible Categorization**

**Source**: Dublin Core Metadata Initiative, Library of Congress

**Taxonomies**:
- **Categories**: Hierarchical classification (parent-child relationships)
- **Types**: Equipment types (from Excel import)
- **Brands**: Manufacturer standardization
- **Models**: Product model tracking
- **Custom Fields**: JSON field for flexibility

**Implementation**:
- Hierarchical categories table (self-referencing)
- Separate brand and model tables
- Custom fields JSON column for extensibility

### 5. **Search & Discovery**

**Source**: Information Architecture best practices

**Search Capabilities**:
- Full-text search across multiple fields
- Faceted filtering (location, category, status, etc.)
- Saved searches for common queries
- Sort by any column
- Pagination for performance

**Implementation**:
- Database indexes on searchable fields
- Efficient WHERE clauses with proper indexing
- Debounced search input (frontend)
- Server-side pagination

### 6. **Data Import Best Practices**

**Source**: ETL (Extract, Transform, Load) standards

**Process**:
1. **Validate**: File structure and data types
2. **Preview**: Show data before import
3. **Map**: Column to field mapping
4. **Transform**: Data normalization (lookups, conversions)
5. **Load**: Batch insert with error handling
6. **Report**: Success/failure summary

**Implementation**:
- Background job processing for large imports
- Error collection and reporting
- Rollback on critical errors
- Duplicate detection (asset tag uniqueness)
- Reference data creation (brands, vendors, locations)

### 7. **Security by Design**

**Source**: OWASP Top 10, SANS Security Guidelines

**Security Controls**:
- **Authentication**: JWT with secure HttpOnly cookies
- **Authorization**: RBAC with permission checks
- **CSRF Protection**: Double submit cookie pattern
- **Input Validation**: Zod schemas, Prisma constraints
- **XSS Prevention**: React auto-escaping, sanitization
- **SQL Injection**: Parameterized queries via Prisma ORM
- **Audit Logging**: Comprehensive activity logs
- **Data Encryption**: HTTPS in production, encrypted backups

**Implementation**:
- authenticate middleware on all routes
- checkPermission middleware for role validation
- validateCsrfToken on state-changing routes
- Zod validation schemas on all inputs
- Structured logging with Winston

### 8. **Performance Optimization**

**Source**: Database optimization best practices

**Strategies**:
- **Indexing**: Strategic indexes on frequently queried columns
- **Pagination**: Server-side pagination to limit result sets
- **Eager Loading**: Include relations in queries to avoid N+1
- **Caching**: Future consideration for frequently accessed data
- **Query Optimization**: Parallel queries where possible
- **Bulk Operations**: Batch processing for imports

**Implementation**:
- Indexes on: assetTag, locationId, officeLocationId, status, categoryId
- Pagination with page/limit parameters
- Prisma include for relations
- Promise.all for parallel queries

### 9. **Usability & User Experience**

**Source**: Nielsen Norman Group, Material Design Guidelines

**Principles**:
- **Consistency**: Follow existing Tech-V2 patterns
- **Feedback**: Loading states, success/error messages
- **Error Prevention**: Validation, confirmations
- **Efficiency**: Bulk operations, keyboard shortcuts
- **Flexibility**: Multiple views (grid, list), saved filters

**Implementation**:
- Material-UI components for consistency
- Loading skeletons and progress indicators
- Confirmation dialogs for destructive actions
- Bulk edit and delete capabilities
- Responsive design for mobile access

### 10. **Reporting & Analytics**

**Source**: Business Intelligence best practices

**Report Types**:
- **Summary**: Total items, active count, total value
- **Location**: Inventory by location with value
- **Category**: Distribution by equipment type
- **Financial**: Purchase value, depreciation (future)
- **Compliance**: Audit reports, disposal reports

**Implementation**:
- Statistics aggregation in service layer
- Dashboard with key metrics
- Filtered exports for custom reports
- Scheduled reports (future phase)

---

## Appendices

### A. Database Migration Script

```sql
-- Add new columns to equipment table
ALTER TABLE equipment 
ADD COLUMN office_location_id UUID REFERENCES office_locations(id),
ADD COLUMN funding_source VARCHAR(200),
ADD COLUMN po_number VARCHAR(100),
ADD COLUMN vendor_id UUID REFERENCES vendors(id),
ADD COLUMN warranty_expires TIMESTAMP,
ADD COLUMN assigned_to_user_id UUID REFERENCES users(id),
ADD COLUMN barcode VARCHAR(200) UNIQUE,
ADD COLUMN qr_code TEXT,
ADD COLUMN maintenance_schedule VARCHAR(100),
ADD COLUMN last_maintenance_date TIMESTAMP,
ADD COLUMN custom_fields JSONB;

-- Add new indexes
CREATE INDEX idx_equipment_office_location ON equipment(office_location_id);
CREATE INDEX idx_equipment_disposed ON equipment(is_disposed);
CREATE INDEX idx_equipment_assigned_user ON equipment(assigned_to_user_id);
CREATE INDEX idx_equipment_location_status ON equipment(office_location_id, status);
CREATE INDEX idx_equipment_category_status ON equipment(category_id, status);

-- Create equipment_attachments table
CREATE TABLE equipment_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  file_name VARCHAR(500) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  description TEXT,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_equipment_attachments_equipment ON equipment_attachments(equipment_id);

-- Create maintenance_history table
CREATE TABLE maintenance_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  maintenance_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  performed_by UUID NOT NULL REFERENCES users(id),
  performed_date TIMESTAMP NOT NULL,
  cost DECIMAL(10,2),
  notes TEXT,
  next_due_date TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maintenance_history_equipment ON maintenance_history(equipment_id);
CREATE INDEX idx_maintenance_history_date ON maintenance_history(performed_date DESC);

-- Create inventory_import_jobs table
CREATE TABLE inventory_import_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_name VARCHAR(500) NOT NULL,
  file_url TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  total_rows INTEGER NOT NULL,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB,
  imported_by UUID NOT NULL REFERENCES users(id),
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_import_jobs_status ON inventory_import_jobs(status);
CREATE INDEX idx_import_jobs_user ON inventory_import_jobs(imported_by);
```

### B. Sample Import Mapping Configuration

```json
{
  "columnMapping": {
    "School": {
      "field": "officeLocationId",
      "type": "lookup",
      "lookupTable": "office_locations",
      "lookupField": "name",
      "required": true
    },
    "Room": {
      "field": "locationId",
      "type": "lookup_or_create",
      "lookupTable": "locations",
      "lookupFields": ["buildingName", "roomNumber"],
      "required": false
    },
    "Tag#": {
      "field": "assetTag",
      "type": "string",
      "required": true,
      "unique": true
    },
    "Type": {
      "field": "categoryId",
      "type": "lookup_or_create",
      "lookupTable": "categories",
      "lookupField": "name",
      "required": false
    },
    "Brand": {
      "field": "brandId",
      "type": "lookup_or_create",
      "lookupTable": "brands",
      "lookupField": "name",
      "required": false
    },
    "Model Number": {
      "field": "modelId",
      "type": "lookup_or_create",
      "lookupTable": "models",
      "lookupFields": ["name", "brandId"],
      "required": false
    },
    "Serial Number": {
      "field": "serialNumber",
      "type": "string",
      "required": false
    },
    "PO#": {
      "field": "poNumber",
      "type": "string",
      "required": false
    },
    "Vendor": {
      "field": "vendorId",
      "type": "lookup_or_create",
      "lookupTable": "vendors",
      "lookupField": "name",
      "required": false
    },
    "Price": {
      "field": "purchasePrice",
      "type": "decimal",
      "required": false
    },
    "Funds": {
      "field": "fundingSource",
      "type": "string",
      "required": false
    },
    "Purchase Date": {
      "field": "purchaseDate",
      "type": "date",
      "format": "YYYY-MM-DD",
      "required": false,
      "nullValues": ["0000-00-00", ""]
    },
    "Disposal Date": {
      "field": "disposedDate",
      "type": "date",
      "format": "YYYY-MM-DD",
      "required": false,
      "nullValues": ["0000-00-00", ""],
      "triggers": {
        "isDisposed": "value !== null && value !== '0000-00-00'"
      }
    }
  },
  "defaults": {
    "status": "active",
    "condition": "good"
  },
  "validation": {
    "requiredColumns": ["School", "Tag#", "Type"],
    "allowDuplicates": false,
    "skipInvalidRows": true
  }
}
```

### C. API Endpoint Summary

| Method | Endpoint | Description | Auth | Permission |
|--------|----------|-------------|------|------------|
| GET | /api/inventory | List inventory items | ✅ | TECH L1+ |
| GET | /api/inventory/stats | Get statistics | ✅ | TECH L1+ |
| GET | /api/inventory/:id | Get single item | ✅ | TECH L1+ |
| GET | /api/inventory/:id/history | Get change history | ✅ | TECH L1+ |
| POST | /api/inventory | Create item | ✅ + CSRF | TECH L1+ |
| PUT | /api/inventory/:id | Update item | ✅ + CSRF | TECH L1+ |
| DELETE | /api/inventory/:id | Delete item | ✅ + CSRF | TECH L1+ |
| POST | /api/inventory/bulk-update | Bulk update | ✅ + CSRF | TECH L1+ |
| GET | /api/locations/:id/inventory | Location inventory | ✅ | TECH L2+ |
| GET | /api/rooms/:id/inventory | Room inventory | ✅ | TECH L2+ |
| POST | /api/inventory/import | Import Excel | ✅ + CSRF | ADMIN |
| GET | /api/inventory/import/:jobId | Import status | ✅ | ADMIN |
| POST | /api/inventory/export | Export data | ✅ + CSRF | TECH L1+ |
| GET | /api/inventory/:id/maintenance | Maintenance history | ✅ | TECH L2+ |
| POST | /api/inventory/:id/maintenance | Add maintenance | ✅ + CSRF | TECH L2+ |
| POST | /api/inventory/:id/attachments | Upload file | ✅ + CSRF | TECH L2+ |
| DELETE | /api/inventory/:id/attachments/:aid | Delete file | ✅ + CSRF | TECH L2+ |

---

## Summary

This comprehensive specification provides a complete blueprint for implementing the Inventory Management System within the Tech-V2 platform. The system will:

1. **Migrate 9,150+ inventory items** from Excel to database
2. **Provide full CRUD operations** with role-based access control
3. **Track complete audit trails** for all changes
4. **Support multi-location management** with hierarchical structure
5. **Enable import/export** in multiple formats (Excel, CSV, PDF)
6. **Deliver advanced search** and filtering capabilities
7. **Generate comprehensive reports** and analytics
8. **Integrate seamlessly** with existing Tech-V2 features
9. **Maintain high security** with authentication, authorization, and CSRF protection
10. **Ensure scalability** and performance for large datasets

The implementation follows industry best practices for asset management, security, and user experience, while maintaining consistency with the existing codebase architecture and patterns.

**Total Estimated Implementation Time**: 6 weeks (240 hours)

**Team Requirements**:
- 1 Backend Developer (Prisma, Express, TypeScript)
- 1 Frontend Developer (React, MUI, TypeScript)
- 1 QA Engineer (Testing)

**Next Steps**:
1. Review and approve specification
2. Create detailed task breakdown in project management tool
3. Set up development environment and test database
4. Begin Phase 1 implementation
5. Establish CI/CD pipeline for automated testing
6. Schedule regular sprint reviews

---

**Document Control**
- **Author**: GitHub Copilot (Claude Sonnet 4.5)
- **Reviewer**: [To be assigned]
- **Approver**: [To be assigned]
- **Version History**: 
  - v1.0 (2026-02-19): Initial specification

---

*End of Specification Document*
