# Equipment Assignment System - Comprehensive Specification

**Document Version:** 1.0  
**Created:** February 20, 2026  
**Author:** Research & Design Agent  
**Status:** Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Research & Best Practices](#research--best-practices)
4. [Proposed Architecture](#proposed-architecture)
5. [Database Schema Design](#database-schema-design)
6. [Backend API Design](#backend-api-design)
7. [Frontend UI Design](#frontend-ui-design)
8. [Assignment Workflows](#assignment-workflows)
9. [Security Considerations](#security-considerations)
10. [Implementation Steps](#implementation-steps)
11. [Dependencies](#dependencies)
12. [Migration Strategy](#migration-strategy)
13. [Testing Approach](#testing-approach)
14. [Potential Risks & Mitigations](#potential-risks--mitigations)

---

## Executive Summary

### Purpose
Extend the Tech-V2 inventory management system to support assignment of equipment to specific users and rooms, in addition to the existing office location assignments. This will provide better tracking of equipment custody, accountability, and usage patterns.

### Scope
- Enable assignment of equipment to individual users
- Enable assignment of equipment to specific rooms within office locations
- Maintain existing office location assignment functionality
- Implement assignment workflows (assign, unassign, transfer)
- Track assignment history and audit trail
- Provide UI for managing assignments
- Support assignment-based filtering and reporting

### Key Architectural Decisions

1. **Assignment Pattern: Flexible Multi-Assignment**
   - Equipment can be assigned to an office location (building-level)
   - Equipment can be assigned to a room within that location (room-level)
   - Equipment can be assigned to a user (person-level)
   - All three can coexist: "MacBook Pro is at Main Office (location), in Room 205 (room), assigned to John Doe (user)"

2. **Database Design: Leverage Existing Schema**
   - Fields `assignedToUserId`, `roomId`, and `officeLocationId` already exist in equipment table
   - No new tables needed for basic assignments
   - Create new `EquipmentAssignmentHistory` table for audit trail

3. **Assignment Workflow: Status-Based**
   - Equipment status determines availability for assignment
   - Status values: `available`, `assigned`, `maintenance`, `storage`, `disposed`, etc.
   - Validation rules prevent assigning unavailable equipment

4. **Permission Model: Role-Based**
   - `inventory:write` permission to assign/unassign equipment
   - `inventory:admin` permission for bulk assignments and overrides
   - Users can view equipment assigned to them (self-service)

---

## Current State Analysis

### What Exists

#### Database Schema (Prisma)
```prisma
model equipment {
  id                  String                @id @default(uuid())
  assetTag            String                @unique
  serialNumber        String?
  name                String
  // ... other fields
  officeLocationId    String?               // ✅ EXISTS
  roomId              String?               // ✅ EXISTS
  assignedToUserId    String?               // ✅ EXISTS
  // ... other fields
  
  // Relations
  officeLocation      OfficeLocation?       @relation(fields: [officeLocationId], references: [id])
  room                Room?                 @relation(fields: [roomId], references: [id])
  assignedToUser      User?                 @relation("EquipmentAssignedTo", fields: [assignedToUserId], references: [id])
  inventory_changes   inventory_changes[]
  
  @@index([assignedToUserId])              // ✅ EXISTS
  @@index([roomId])                        // ✅ EXISTS
}

model Room {
  id         String         @id @default(uuid())
  locationId String
  name       String
  type       String?
  location   OfficeLocation @relation(fields: [locationId], references: [id])
  equipment  equipment[]    // ✅ Relation exists
}

model User {
  id                String      @id @default(uuid())
  entraId           String      @unique
  email             String      @unique
  // ... other fields
  assignedEquipment equipment[] @relation("EquipmentAssignedTo") // ✅ Relation exists
}
```

#### Backend Services
- ✅ `InventoryService` - Full CRUD operations for equipment
- ✅ `RoomService` - Room management operations
- ✅ `UserService` - User management operations
- ✅ `inventory_changes` table - Audit trail for all equipment changes

#### Frontend Components
- ✅ `InventoryManagement` page - List view with filtering
- ✅ `InventoryFormDialog` - Create/edit equipment items
- ✅ Equipment fields for location, but no UI for user/room assignment

### What's Missing

#### Backend
- ❌ Assignment-specific API endpoints (`/api/equipment/:id/assign`, `/api/equipment/:id/unassign`, etc.)
- ❌ Assignment validation logic (prevent assigning disposed equipment, check availability)
- ❌ Assignment history tracking (separate from general inventory_changes)
- ❌ Assignment-based queries (get equipment by assigned user, get available equipment)
- ❌ Bulk assignment operations

#### Frontend
- ❌ Assignment UI component (dialog/form for assigning equipment)
- ❌ User selector (search and select users)
- ❌ Room selector (search and select rooms)
- ❌ Assignment display in equipment details (show current assignee)
- ❌ Assignment history viewer
- ❌ "My Equipment" view (user's assigned equipment)
- ❌ Assignment status badges/indicators

#### Business Logic
- ❌ Assignment workflow state machine
- ❌ Assignment validation rules
- ❌ Notification system (notify user when equipment is assigned to them)
- ❌ Return/check-in workflow
- ❌ Transfer workflow (reassign from one user to another)

---

## Research & Best Practices

### 1. Equipment Tracking Systems (Industry Standards)

**Source: ISO 55000 Asset Management Standards**
- Equipment should have single point of accountability (primary assignee)
- Assignment history must be immutable and auditable
- Support for temporary vs. permanent assignments
- Clear ownership chain for assets

**Source: ITIL Service Asset and Configuration Management**
- Configuration items (CIs) have relationships to users, locations, and services
- Assignment status lifecycle: Available → Assigned → In Use → Returned
- Support for cascading assignments (equipment → user → location)

### 2. Multi-Entity Assignment Patterns

**Source: Enterprise Asset Management Best Practices**
- **Hierarchical Assignment**: Location → Room → User (most specific wins)
- **Multiple Assignment Types**: Physical location + Logical owner
- **Assignment Contexts**: "Stored at" vs "Assigned to" vs "Used by"

**Recommended Pattern for Tech-V2:**
```
Equipment Assignment Hierarchy:
├─ Office Location (Building-level)      [officeLocationId]
│  └─ Room (Room-level)                  [roomId]
│     └─ User (Person-level)             [assignedToUserId]
└─ Status (Availability)                 [status]
```

### 3. Assignment History and Audit Trails

**Source: NIST SP 800-92 (Log Management)**
- All assignment changes must be logged
- Log entries must be immutable
- Required fields: what, who, when, why (optional notes)
- Retention policy for audit logs (typically 7 years for government/education)

**Recommended Implementation:**
- Separate `EquipmentAssignmentHistory` table
- Automatically create history entry on every assignment change
- Never delete history records (soft delete equipment if needed)

### 4. Assignment Status Workflows

**Source: CMDB & Asset Management Software Patterns (ServiceNow, Jira)**

**Recommended Status Values:**
- `available` - Not assigned, ready for assignment
- `assigned` - Assigned to user/room but not actively in use
- `in-use` - Actively being used by assignee
- `maintenance` - Temporarily unavailable for maintenance/repair
- `storage` - Not in active circulation
- `disposed` - Permanently removed from inventory
- `lost` - Missing/unaccounted for
- `damaged` - Damaged and awaiting repair/disposal

**Assignment Rules:**
- Can only assign equipment with status: `available`, `in-use`, or `storage`
- Cannot assign equipment with status: `disposed`, `lost`, or `maintenance`
- Assigning changes status from `available` → `assigned`
- Unassigning changes status from `assigned` → `available`

### 5. UI/UX Patterns for Assignment Management

**Source: Material Design Guidelines & SaaS Asset Management UIs**

**Assignment Dialog Pattern:**
```
┌─────────────────────────────────────┐
│ Assign Equipment                    │
├─────────────────────────────────────┤
│ Equipment: MacBook Pro (Tag: 12345) │
│                                     │
│ Assign To:                          │
│ ○ User        [Search Users... ▼]  │
│ ○ Room        [Select Room... ▼]   │
│                                     │
│ Office Location: [Main Office ▼]   │
│                                     │
│ Notes (optional):                   │
│ [_____________________________]     │
│                                     │
│        [Cancel]    [Assign]         │
└─────────────────────────────────────┘
```

**Assignment Display Pattern (in equipment details):**
```
┌─────────────────────────────────────────┐
│ Current Assignment                      │
├─────────────────────────────────────────┤
│ 👤 User:     John Doe                   │
│ 📍 Room:     Room 205                   │
│ 🏢 Location: Main Office                │
│ 📅 Since:    Jan 15, 2026              │
│                                         │
│ [Unassign] [Transfer] [View History]   │
└─────────────────────────────────────────┘
```

### 6. Database Schema Design for Equipment Tracking

**Source: Database Design Best Practices (Martin Fowler's Enterprise Patterns)**

**Pattern: Hybrid Current State + History**
- Store current assignment in main equipment table (fast queries)
- Store assignment history in separate table (audit trail)
- Use database triggers or application logic to sync both

**Benefits:**
- Fast queries for "what's currently assigned to user X"
- Complete audit trail without performance impact
- Support for time-travel queries ("what did user X have on date Y")

---

## Proposed Architecture

### High-Level Overview

```
┌────────────────────────────────────────────────────────────┐
│                     Frontend (React)                       │
├────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ Inventory    │  │ Assignment   │  │ My Equipment    │ │
│  │ Management   │  │ Dialog       │  │ View            │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘ │
│         │                  │                    │          │
│         └──────────────────┴────────────────────┘          │
│                            ↓                                │
│  ┌─────────────────────────────────────────────────────┐  │
│  │         API Service Layer (axios)                   │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────┬─────────────────────────────────┘
                           │ HTTPS/REST
┌──────────────────────────┴─────────────────────────────────┐
│                  Backend (Express + TypeScript)            │
├────────────────────────────────────────────────────────────┤
│  Middleware: Auth | Permissions | Validation | CSRF        │
├────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ Inventory    │  │ Assignment   │  │ User            │ │
│  │ Controller   │─▶│ Service      │◀─│ Controller      │ │
│  └──────────────┘  └──────┬───────┘  └─────────────────┘ │
│                            │                                │
│                    ┌───────┴────────┐                      │
│                    │ Room Service   │                      │
│                    └────────────────┘                      │
└──────────────────────────┬─────────────────────────────────┘
                           │ Prisma ORM
┌──────────────────────────┴─────────────────────────────────┐
│                  Database (PostgreSQL)                     │
├────────────────────────────────────────────────────────────┤
│  equipment | inventory_changes | EquipmentAssignmentHistory│
│  User | Room | OfficeLocation                             │
└────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

#### Backend Components

**1. Assignment Service (`backend/src/services/assignment.service.ts`)** - NEW
- Core business logic for assignments
- Methods:
  - `assignToUser(equipmentId, userId, assignedBy, notes?)`
  - `assignToRoom(equipmentId, roomId, assignedBy, notes?)`
  - `unassign(equipmentId, assignedBy, notes?)`
  - `transfer(equipmentId, fromUserId, toUserId, assignedBy, notes?)`
  - `getAssignmentHistory(equipmentId)`
  - `getUserAssignments(userId)`
  - `getRoomAssignments(roomId)`
  - `getAvailableEquipment(filters)`

**2. Assignment Controller (`backend/src/controllers/assignment.controller.ts`)** - NEW
- HTTP request handlers for assignment operations
- Endpoints (detailed in API Design section)

**3. Enhanced Inventory Service** - MODIFY
- Add validation for assignment operations
- Update `findAll()` to filter by assignment status

**4. Assignment Validators (`backend/src/validators/assignment.validators.ts`)** - NEW
- Zod schemas for assignment requests
- Validation logic for business rules

#### Frontend Components

**1. AssignmentDialog Component** - NEW (`frontend/src/components/equipment/AssignmentDialog.tsx`)
- Modal dialog for assigning equipment
- User search autocomplete
- Room selector dropdown
- Note input field

**2. AssignmentCard Component** - NEW (`frontend/src/components/equipment/AssignmentCard.tsx`)
- Display current assignment info
- Action buttons (Unassign, Transfer)
- Embedded in equipment details view

**3. AssignmentHistoryList Component** - NEW (`frontend/src/components/equipment/AssignmentHistoryList.tsx`)
- Timeline view of assignment changes
- Filter by date range
- Export history

**4. MyEquipmentPage** - NEW (`frontend/src/pages/MyEquipmentPage.tsx`)
- User-specific view of assigned equipment
- Filter and search capabilities
- Quick actions (report issue, return equipment)

**5. Enhanced InventoryManagement Page** - MODIFY (`frontend/src/pages/InventoryManagement.tsx`)
- Add "Assign" button to equipment rows
- Add "Assigned To" column in table
- Add assignment filter chips

---

## Database Schema Design

### Option A: Use Existing Fields (RECOMMENDED)

**✅ Advantages:**
- No schema changes needed
- Fields and indexes already exist
- Relations already defined
- Backward compatible

**Implementation:**
Use existing fields in `equipment` table:
- `officeLocationId` - Office location assignment
- `roomId` - Room assignment
- `assignedToUserId` - User assignment

**Required: New Assignment History Table**

```prisma
model EquipmentAssignmentHistory {
  id              String    @id @default(uuid())
  equipmentId     String
  assignmentType  String    // "user", "room", "location", "unassign"
  assignedToId    String?   // UUID of user, room, or location
  assignedToType  String?   // "User", "Room", "OfficeLocation"
  assignedToName  String    // Cached name for display
  assignedBy      String    // User ID who made the assignment
  assignedByName  String    // Cached name for display
  assignedAt      DateTime  @default(now())
  unassignedAt    DateTime? // When unassigned (if applicable)
  notes           String?
  // Snapshot of equipment state at assignment time
  equipmentName   String
  equipmentTag    String
  createdAt       DateTime  @default(now())
  
  equipment       equipment @relation(fields: [equipmentId], references: [id], onDelete: Cascade)
  user            User      @relation(fields: [assignedBy], references: [id])
  
  @@index([equipmentId])
  @@index([assignedToId, assignedToType])
  @@index([assignedBy])
  @@index([assignedAt])
  @@map("equipment_assignment_history")
}

// Add to User model
model User {
  // ... existing fields
  assignmentHistory      EquipmentAssignmentHistory[]
}

// Add to equipment model
model equipment {
  // ... existing fields
  assignmentHistory      EquipmentAssignmentHistory[]
}
```

### Option B: Single Assignment Pattern (NOT RECOMMENDED)

Create a single `EquipmentAssignment` table with exclusive assignment logic. **Not recommended** because it's more complex and less flexible than using existing fields.

---

## Backend API Design

### Assignment Endpoints

#### 1. Assign Equipment to User
```
POST /api/equipment/:equipmentId/assign/user

Request Body:
{
  "userId": "uuid",
  "notes": "string (optional)"
}

Response: 200 OK
{
  "id": "uuid",
  "assetTag": "string",
  "name": "string",
  "assignedToUserId": "uuid",
  "assignedToUser": {
    "id": "uuid",
    "email": "string",
    "displayName": "string"
  },
  "updatedAt": "ISO8601"
}

Errors:
- 404: Equipment or User not found
- 400: Equipment not available for assignment (status: disposed, maintenance)
- 403: Insufficient permissions
- 409: Equipment already assigned (if strict mode)
```

#### 2. Assign Equipment to Room
```
POST /api/equipment/:equipmentId/assign/room

Request Body:
{
  "roomId": "uuid",
  "notes": "string (optional)"
}

Response: 200 OK
{
  "id": "uuid",
  "assetTag": "string",
  "name": "string",
  "roomId": "uuid",
  "room": {
    "id": "uuid",
    "name": "string",
    "locationId": "uuid"
  },
  "updatedAt": "ISO8601"
}

Errors: Same as above
```

#### 3. Unassign Equipment
```
POST /api/equipment/:equipmentId/unassign

Request Body:
{
  "unassignType": "user" | "room" | "all",  // What to unassign
  "notes": "string (optional)"
}

Response: 200 OK
{
  "id": "uuid",
  "assetTag": "string",
  "name": "string",
  "assignedToUserId": null,
  "roomId": null,  // Depending on unassignType
  "status": "available",
  "updatedAt": "ISO8601"
}
```

#### 4. Transfer Equipment (User to User)
```
POST /api/equipment/:equipmentId/transfer

Request Body:
{
  "fromUserId": "uuid",
  "toUserId": "uuid",
  "notes": "string (optional)"
}

Response: 200 OK
{
  "id": "uuid",
  "assignedToUserId": "uuid",
  "assignedToUser": { ... },
  "updatedAt": "ISO8601"
}
```

#### 5. Get Assignment History
```
GET /api/equipment/:equipmentId/assignment-history

Query Parameters:
- limit: number (default: 50)
- offset: number (default: 0)
- assignmentType: "user" | "room" | "location" (filter)

Response: 200 OK
{
  "history": [
    {
      "id": "uuid",
      "equipmentId": "uuid",
      "assignmentType": "user",
      "assignedToId": "uuid",
      "assignedToName": "John Doe",
      "assignedBy": "uuid",
      "assignedByName": "Admin User",
      "assignedAt": "ISO8601",
      "unassignedAt": "ISO8601 | null",
      "notes": "string"
    }
  ],
  "total": 100
}
```

#### 6. Get Equipment Assigned to User
```
GET /api/users/:userId/equipment

Query Parameters:
- status: "assigned" | "all" (default: "assigned")
- includeHistory: boolean (default: false)

Response: 200 OK
{
  "equipment": [
    {
      "id": "uuid",
      "assetTag": "string",
      "name": "string",
      "assignedAt": "ISO8601",
      ...full equipment object
    }
  ],
  "total": 10
}
```

#### 7. Get Equipment in Room
```
GET /api/rooms/:roomId/equipment

Response: 200 OK
{
  "room": {
    "id": "uuid",
    "name": "string",
    "location": { ... }
  },
  "equipment": [ ... ],
  "total": 25
}
```

#### 8. Get Available Equipment
```
GET /api/equipment/available

Query Parameters:
- categoryId: string (optional)
- officeLocationId: string (optional)
- search: string (optional)
- page: number
- limit: number

Response: 200 OK
{
  "items": [ ...equipment objects ],
  "total": 50,
  "page": 1,
  "totalPages": 5
}
```

#### 9. Bulk Assignment Operations
```
POST /api/equipment/bulk-assign

Request Body:
{
  "equipmentIds": ["uuid1", "uuid2"],
  "assignmentType": "user" | "room",
  "assignedToId": "uuid",
  "notes": "string (optional)"
}

Response: 200 OK
{
  "success": 8,
  "failed": 2,
  "errors": [
    {
      "equipmentId": "uuid",
      "error": "Equipment is disposed"
    }
  ]
}
```

### Validation Rules (Zod Schemas)

```typescript
// backend/src/validators/assignment.validators.ts

import { z } from 'zod';

export const AssignToUserSchema = z.object({
  params: z.object({
    equipmentId: z.string().uuid(),
  }),
  body: z.object({
    userId: z.string().uuid(),
    notes: z.string().max(500).optional(),
  }),
});

export const AssignToRoomSchema = z.object({
  params: z.object({
    equipmentId: z.string().uuid(),
  }),
  body: z.object({
    roomId: z.string().uuid(),
    notes: z.string().max(500).optional(),
  }),
});

export const UnassignSchema = z.object({
  params: z.object({
    equipmentId: z.string().uuid(),
  }),
  body: z.object({
    unassignType: z.enum(['user', 'room', 'all']),
    notes: z.string().max(500).optional(),
  }),
});

export const TransferSchema = z.object({
  params: z.object({
    equipmentId: z.string().uuid(),
  }),
  body: z.object({
    fromUserId: z.string().uuid(),
    toUserId: z.string().uuid(),
    notes: z.string().max(500).optional(),
  }),
});

export const BulkAssignSchema = z.object({
  body: z.object({
    equipmentIds: z.array(z.string().uuid()).min(1).max(100),
    assignmentType: z.enum(['user', 'room']),
    assignedToId: z.string().uuid(),
    notes: z.string().max(500).optional(),
  }),
});
```

---

## Frontend UI Design

### 1. AssignmentDialog Component

**File:** `frontend/src/components/equipment/AssignmentDialog.tsx`

**Features:**
- Modal dialog triggered from equipment row or details page
- Radio buttons to select assignment type (User or Room)
- Autocomplete user search (debounced, shows displayName and email)
- Room dropdown (filtered by selected office location)
- Optional notes textarea
- Validation feedback

**Props Interface:**
```typescript
interface AssignmentDialogProps {
  open: boolean;
  equipment: InventoryItem | null;
  onClose: () => void;
  onSuccess: () => void;
}
```

**Component Structure:**
```tsx
<Dialog open={open} maxWidth="sm" fullWidth>
  <DialogTitle>Assign Equipment</DialogTitle>
  <DialogContent>
    {equipment && (
      <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
        <Typography variant="subtitle2">Equipment</Typography>
        <Typography variant="body1">
          {equipment.name} (#{equipment.assetTag})
        </Typography>
      </Box>
    )}
    
    <FormControl component="fieldset">
      <FormLabel>Assign To</FormLabel>
      <RadioGroup value={assignmentType} onChange={handleTypeChange}>
        <FormControlLabel value="user" control={<Radio />} label="User" />
        <FormControlLabel value="room" control={<Radio />} label="Room" />
      </RadioGroup>
    </FormControl>
    
    {assignmentType === 'user' && (
      <Autocomplete
        options={users}
        getOptionLabel={(user) => `${user.displayName} (${user.email})`}
        renderInput={(params) => (
          <TextField {...params} label="Search Users" />
        )}
        onChange={(_, user) => setSelectedUser(user)}
      />
    )}
    
    {assignmentType === 'room' && (
      <FormControl fullWidth>
        <InputLabel>Office Location</InputLabel>
        <Select value={locationId} onChange={handleLocationChange}>
          {locations.map(loc => (
            <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
          ))}
        </Select>
      </FormControl>
      
      <FormControl fullWidth sx={{ mt: 2 }}>
        <InputLabel>Room</InputLabel>
        <Select value={roomId} onChange={handleRoomChange}>
          {rooms.map(room => (
            <MenuItem key={room.id} value={room.id}>{room.name}</MenuItem>
          ))}
        </Select>
      </FormControl>
    )}
    
    <TextField
      fullWidth
      multiline
      rows={2}
      label="Notes (optional)"
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      sx={{ mt: 2 }}
    />
  </DialogContent>
  <DialogActions>
    <Button onClick={onClose}>Cancel</Button>
    <Button variant="contained" onClick={handleSubmit} disabled={loading}>
      Assign
    </Button>
  </DialogActions>
</Dialog>
```

### 2. AssignmentCard Component

**File:** `frontend/src/components/equipment/AssignmentCard.tsx`

**Features:**
- Display current assignment information
- Show user avatar/name or room name
- Action buttons: Unassign, Transfer, View History
- Compact design for embedding in equipment details

**Component Structure:**
```tsx
<Card>
  <CardContent>
    <Typography variant="h6" gutterBottom>
      Current Assignment
    </Typography>
    
    {equipment.assignedToUser && (
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Avatar sx={{ mr: 2 }}>
          {equipment.assignedToUser.displayName?.[0]}
        </Avatar>
        <Box>
          <Typography variant="subtitle1">
            {equipment.assignedToUser.displayName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {equipment.assignedToUser.email}
          </Typography>
        </Box>
      </Box>
    )}
    
    {equipment.room && (
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <LocationIcon sx={{ mr: 1 }} />
        <Typography>
          {equipment.room.name} - {equipment.officeLocation?.name}
        </Typography>
      </Box>
    )}
    
    {!equipment.assignedToUser && !equipment.room && (
      <Typography color="text.secondary">
        Not currently assigned
      </Typography>
    )}
  </CardContent>
  <CardActions>
    <Button size="small" onClick={handleUnassign}>
      Unassign
    </Button>
    <Button size="small" onClick={handleTransfer}>
      Transfer
    </Button>
    <Button size="small" onClick={handleViewHistory}>
      View History
    </Button>
  </CardActions>
</Card>
```

### 3. AssignmentHistoryList Component

**File:** `frontend/src/components/equipment/AssignmentHistoryList.tsx`

**Features:**
- Timeline view of assignment history
- Filter by date range
- Show assignment type (user/room)
- Show who made the assignment
- Export to CSV

**Component Structure:**
```tsx
<Box>
  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
    <Typography variant="h6">Assignment History</Typography>
    <Button startIcon={<DownloadIcon />} onClick={handleExport}>
      Export
    </Button>
  </Box>
  
  <Timeline>
    {history.map((entry) => (
      <TimelineItem key={entry.id}>
        <TimelineSeparator>
          <TimelineDot color={entry.assignmentType === 'user' ? 'primary' : 'secondary'}>
            {entry.assignmentType === 'user' ? <PersonIcon /> : <RoomIcon />}
          </TimelineDot>
          <TimelineConnector />
        </TimelineSeparator>
        <TimelineContent>
          <Typography variant="subtitle2">
            Assigned to {entry.assignedToName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            by {entry.assignedByName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDate(entry.assignedAt)}
          </Typography>
          {entry.notes && (
            <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
              "{entry.notes}"
            </Typography>
          )}
        </TimelineContent>
      </TimelineItem>
    ))}
  </Timeline>
</Box>
```

### 4. MyEquipmentPage

**File:** `frontend/src/pages/MyEquipmentPage.tsx`

**Features:**
- User-specific view of assigned equipment
- Grid or list view toggle
- Search and filter capabilities
- Quick actions (report issue, request return)

**Layout:**
```tsx
<Container maxWidth="lg">
  <Box sx={{ py: 3 }}>
    <Typography variant="h4" gutterBottom>
      My Equipment
    </Typography>
    
    <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
      <TextField
        placeholder="Search equipment..."
        size="small"
        InputProps={{
          startAdornment: <SearchIcon />,
        }}
      />
      <ToggleButtonGroup value={viewMode}>
        <ToggleButton value="grid">
          <GridViewIcon />
        </ToggleButton>
        <ToggleButton value="list">
          <ListViewIcon />
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
    
    {viewMode === 'grid' ? (
      <Grid container spacing={3}>
        {equipment.map((item) => (
          <Grid item xs={12} sm={6} md={4} key={item.id}>
            <EquipmentCard item={item} />
          </Grid>
        ))}
      </Grid>
    ) : (
      <EquipmentTable items={equipment} />
    )}
  </Box>
</Container>
```

### 5. Enhanced InventoryManagement Page

**Modifications to:** `frontend/src/pages/InventoryManagement.tsx`

**Add the following:**
- New column "Assigned To" in the DataGrid
- "Assign" action button in row actions
- Filter chip for "Available Equipment"
- Filter chip for "Assigned Equipment"

**New Column Definition:**
```tsx
{
  field: 'assignedTo',
  headerName: 'Assigned To',
  width: 200,
  renderCell: (params) => {
    const item = params.row;
    if (item.assignedToUser) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Avatar sx={{ width: 24, height: 24, mr: 1, fontSize: 12 }}>
            {item.assignedToUser.displayName?.[0]}
          </Avatar>
          <Typography variant="body2">
            {item.assignedToUser.displayName}
          </Typography>
        </Box>
      );
    } else if (item.room) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <RoomIcon sx={{ width: 20, height: 20, mr: 1 }} />
          <Typography variant="body2">
            {item.room.name}
          </Typography>
        </Box>
      );
    }
    return <Chip label="Available" size="small" color="success" />;
  },
},
```

**New Action Button:**
```tsx
<IconButton
  size="small"
  onClick={() => handleOpenAssignDialog(item)}
  title="Assign Equipment"
>
  <AssignmentIcon />
</IconButton>
```

---

## Assignment Workflows

### Workflow 1: Assign Equipment to User

```
┌─────────────────────────────────────────────────────────────┐
│ User clicks "Assign" button on equipment row               │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ AssignmentDialog opens, pre-filled with equipment info     │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ User selects "Assign to User" radio button                 │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ User searches and selects target user                      │
│ (Autocomplete with debounced API search)                   │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ User optionally enters notes                               │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ User clicks "Assign" button                                │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Frontend validates form                                     │
│ - Equipment selected? ✓                                     │
│ - User selected? ✓                                          │
│ - Notes within length limit? ✓                             │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ POST /api/equipment/:id/assign/user                        │
│ Body: { userId, notes }                                     │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend: Authenticate & Authorize                          │
│ - Valid JWT token? ✓                                        │
│ - User has 'inventory:write' permission? ✓                 │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend: Validate Request                                  │
│ - Equipment exists? ✓                                       │
│ - Target user exists? ✓                                     │
│ - Equipment available for assignment? ✓                     │
│   (status not 'disposed', 'lost', or 'maintenance')        │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend: Update Equipment Record                           │
│ - Set assignedToUserId = userId                            │
│ - Set status = 'assigned' (if was 'available')             │
│ - Set updatedAt = now()                                     │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend: Create Assignment History Record                  │
│ - equipmentId, assignmentType='user', assignedToId=userId  │
│ - assignedBy=currentUserId, notes, timestamp               │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend: Create Audit Log Entry                            │
│ - table: inventory_changes                                 │
│ - changeType='ASSIGNMENT', fieldChanged='assignedToUserId' │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend: Return Updated Equipment Object                   │
│ - Include assignedToUser relation                          │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Frontend: Display Success Message                          │
│ - Close dialog                                              │
│ - Refresh equipment list (React Query invalidation)        │
│ - Show snackbar: "Equipment assigned to {userName}"        │
└─────────────────────────────────────────────────────────────┘
```

### Workflow 2: Unassign Equipment

```
┌─────────────────────────────────────────────────────────────┐
│ User clicks "Unassign" button from AssignmentCard          │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Confirmation Dialog                                         │
│ "Are you sure you want to unassign this equipment?"        │
│ [Cancel] [Confirm]                                          │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ POST /api/equipment/:id/unassign                           │
│ Body: { unassignType: "all", notes: "Returned to storage" }│
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend: Update Equipment Record                           │
│ - Set assignedToUserId = null                              │
│ - Set roomId = null (if unassignType='all')                │
│ - Set status = 'available'                                  │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend: Update Assignment History Record                  │
│ - Find latest assignment record                            │
│ - Set unassignedAt = now()                                  │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Frontend: Refresh UI                                        │
│ - Show success message                                      │
│ - Update equipment details                                  │
└─────────────────────────────────────────────────────────────┘
```

### Workflow 3: Transfer Equipment (User to User)

```
┌─────────────────────────────────────────────────────────────┐
│ User clicks "Transfer" button from AssignmentCard          │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ TransferDialog opens                                        │
│ - Current assignee: John Doe                               │
│ - Transfer to: [Search Users... ▼]                        │
│ - Notes: [____________________]                            │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ User selects new assignee                                  │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ POST /api/equipment/:id/transfer                           │
│ Body: { fromUserId, toUserId, notes }                      │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend: Update Equipment Record                           │
│ - Set assignedToUserId = toUserId                          │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend: Create Two History Records                        │
│ - Close old assignment (set unassignedAt)                  │
│ - Create new assignment record                             │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Frontend: Show success                                      │
│ "Equipment transferred from John Doe to Jane Smith"        │
└─────────────────────────────────────────────────────────────┘
```

### State Machine: Assignment Status

```
                    ┌──────────────┐
                    │   CREATED    │ (New equipment added)
                    └──────┬───────┘
                           │
                           ↓
                    ┌──────────────┐
         ┌─────────▶│  AVAILABLE   │◀──────────┐
         │          └──────┬───────┘           │
         │                 │                    │
         │          [Assign Action]      [Unassign Action]
         │                 │                    │
         │                 ↓                    │
         │          ┌──────────────┐           │
         │          │   ASSIGNED   │───────────┘
         │          └──────┬───────┘
         │                 │
         │          [Mark Maintenance]
         │                 │
         │                 ↓
         │          ┌──────────────┐
         └──────────│ MAINTENANCE  │
                    └──────────────┘

Cannot assign if status is:
  - disposed
  - lost
  - maintenance (must return to 'available' first)
```

---

## Security Considerations

### Reference: Security Standards from Copilot Instructions

**Security Score Target: 85% (B) or higher**

### 1. Authentication & Authorization

**Requirements:**
- ✅ All assignment endpoints protected by `authenticateToken` middleware
- ✅ Permission checks: `inventory:write` for assign/unassign operations
- ✅ Permission check: `inventory:admin` for bulk operations
- ✅ Users can view their own assigned equipment (self-service)

**Implementation:**
```typescript
// All routes protected
router.post('/equipment/:equipmentId/assign/user',
  authenticateToken,                   // JWT validation
  checkPermission('inventory:write'),  // Permission check
  validateRequest(AssignToUserSchema), // Input validation
  assignmentController.assignToUser
);

// Bulk operations require admin
router.post('/equipment/bulk-assign',
  authenticateToken,
  checkPermission('inventory:admin'),  // Admin only
  validateRequest(BulkAssignSchema),
  assignmentController.bulkAssign
);
```

### 2. Input Validation (Zod Schemas)

**Requirements:**
- ✅ All assignment requests validated with Zod schemas
- ✅ UUID validation for equipment IDs, user IDs, room IDs
- ✅ String length limits enforced (notes max 500 chars)
- ✅ Enum validation for assignment types

**Implementation:**
```typescript
export const AssignToUserSchema = z.object({
  params: z.object({
    equipmentId: z.string().uuid('Invalid equipment ID'),
  }),
  body: z.object({
    userId: z.string().uuid('Invalid user ID'),
    notes: z.string().max(500, 'Notes too long').optional(),
  }),
});
```

### 3. CSRF Protection

**Requirements:**
- ✅ Frontend MUST send CSRF token with all POST/PUT/DELETE requests
- ✅ Backend validates CSRF token (already implemented via middleware)

**Implementation:**
```typescript
// Frontend: axios interceptor
axios.interceptors.request.use((config) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method?.toUpperCase())) {
    config.headers['X-CSRF-Token'] = getCsrfToken();
  }
  return config;
});
```

### 4. Audit Logging Requirements

**Requirements:**
- ✅ Use structured logger (Winston/Pino) - **NO console.log**
- ✅ Log all assignment operations
- ✅ Do NOT log sensitive data (PII, tokens)
- ✅ Include context: userId, equipmentId, action

**Implementation:**
```typescript
// ✅ CORRECT
logger.info('Equipment assigned to user', {
  equipmentId,
  userId,
  assignedBy: currentUser.id,
  timestamp: new Date().toISOString(),
});

// ❌ WRONG - Do NOT do this
console.log(`Assigning equipment ${equipmentId} to user ${user.email}`);
```

### 5. Data Validation & Business Rules

**Critical Validations:**
```typescript
// Validation #1: Equipment exists and is not deleted
const equipment = await prisma.equipment.findUnique({
  where: { id: equipmentId },
});
if (!equipment || equipment.isDisposed) {
  throw new ValidationError('Equipment not available for assignment');
}

// Validation #2: Target user/room exists
const user = await prisma.user.findUnique({
  where: { id: userId },
});
if (!user || !user.isActive) {
  throw new NotFoundError('User not found or inactive');
}

// Validation #3: Equipment status allows assignment
const validStatuses = ['available', 'storage', 'assigned'];
if (!validStatuses.includes(equipment.status)) {
  throw new ValidationError(
    `Cannot assign equipment with status '${equipment.status}'`
  );
}

// Validation #4: User cannot be assigned to themselves in transfer
if (fromUserId === toUserId) {
  throw new ValidationError('Cannot transfer equipment to the same user');
}
```

### 6. Error Handling

**Requirements:**
- ✅ Use custom error classes (NotFoundError, ValidationError, etc.)
- ✅ Sanitize error messages before sending to client
- ✅ Never expose internal stack traces to client
- ✅ Log detailed errors server-side only

**Implementation:**
```typescript
// Service layer
if (!equipment) {
  throw new NotFoundError('Equipment', equipmentId);
}

// Controller layer
try {
  const result = await assignmentService.assignToUser(equipmentId, userId, currentUser);
  res.status(200).json(result);
} catch (error) {
  if (error instanceof AppError) {
    logger.warn('Assignment failed', {
      error: error.message,
      equipmentId,
      userId,
    });
    return res.status(error.statusCode).json({ error: error.message });
  }
  
  // Unexpected errors
  logger.error('Unexpected error during assignment', {
    error: error instanceof Error ? error.message : 'Unknown error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
  res.status(500).json({ error: 'Internal server error' });
}
```

### 7. Rate Limiting

**Requirements:**
- ✅ Rate limiting already implemented globally (100 req/15min)
- ✅ Maintain rate limiting on all new endpoints
- ✅ Consider stricter limits for bulk operations

### 8. Security Checklist for Assignment System

**Pre-Implementation Verification:**
- [ ] All routes have `authenticateToken` middleware
- [ ] Sensitive routes have `checkPermission` middleware
- [ ] All inputs validated with Zod schemas
- [ ] No `console.log` statements (use structured logger)
- [ ] No sensitive data in logs
- [ ] Custom error classes used
- [ ] Error messages sanitized
- [ ] CSRF tokens sent with mutations
- [ ] Rate limiting applied
- [ ] Business rule validations in place

---

## Implementation Steps

### Phase 1: Database Schema (1-2 hours)

**Tasks:**
1. Create migration for `EquipmentAssignmentHistory` table
2. Add relation to User and equipment models
3. Run migration: `npx prisma migrate dev --name add-assignment-history`
4. Generate Prisma client: `npx prisma generate`
5. Verify schema changes in database

**Files to Create/Modify:**
- `backend/prisma/migrations/YYYYMMDDHHMMSS_add_assignment_history/migration.sql`
- `backend/prisma/schema.prisma` (add EquipmentAssignmentHistory model)

### Phase 2: Backend Types & Validators (2 hours)

**Tasks:**
1. Create assignment-specific TypeScript interfaces
2. Create Zod validation schemas for all assignment endpoints
3. Create custom error messages for assignment failures

**Files to Create:**
- `backend/src/types/assignment.types.ts`
- `backend/src/validators/assignment.validators.ts`

### Phase 3: Backend Service Layer (4-6 hours)

**Tasks:**
1. Create `AssignmentService` class
2. Implement `assignToUser()` method with validations
3. Implement `assignToRoom()` method
4. Implement `unassign()` method
5. Implement `transfer()` method (user to user)
6. Implement `getAssignmentHistory()` method
7. Implement `getUserAssignments()` method
8. Implement `getRoomAssignments()` method
9. Implement `bulkAssign()` method
10. Add comprehensive error handling and logging
11. Write unit tests for all service methods

**Files to Create:**
- `backend/src/services/assignment.service.ts`
- `backend/src/services/assignment.service.test.ts`

### Phase 4: Backend Controller Layer (3-4 hours)

**Tasks:**
1. Create `AssignmentController` with HTTP handlers
2. Implement all assignment endpoints (9 endpoints total)
3. Add request validation middleware
4. Add permission checks
5. Add error handling
6. Write integration tests for all endpoints

**Files to Create:**
- `backend/src/controllers/assignment.controller.ts`
- `backend/src/controllers/assignment.controller.test.ts`

### Phase 5: Backend Routes (1 hour)

**Tasks:**
1. Create assignment routes file
2. Define all assignment endpoints with middleware
3. Register routes in main server.ts

**Files to Create:**
- `backend/src/routes/assignment.routes.ts`

**Files to Modify:**
- `backend/src/server.ts` (register assignment routes)

### Phase 6: Frontend Types & Services (2 hours)

**Tasks:**
1. Create frontend assignment types
2. Create assignment API service with axios methods
3. Add error handling and TypeScript types

**Files to Create:**
- `frontend/src/types/assignment.types.ts`
- `frontend/src/services/assignment.service.ts`

### Phase 7: Frontend Components (8-10 hours)

**Tasks:**
1. Create `AssignmentDialog` component
   - User autocomplete with debounced search
   - Room dropdown filtered by location
   - Notes input
   - Form validation
2. Create `AssignmentCard` component
   - Display current assignment
   - Action buttons (Unassign, Transfer, History)
3. Create `AssignmentHistoryList` component
   - Timeline view
   - Export functionality
4. Create `TransferDialog` component (for user-to-user transfers)
5. Write unit tests for all components

**Files to Create:**
- `frontend/src/components/equipment/AssignmentDialog.tsx`
- `frontend/src/components/equipment/AssignmentCard.tsx`
- `frontend/src/components/equipment/AssignmentHistoryList.tsx`
- `frontend/src/components/equipment/TransferDialog.tsx`
- Test files for each component

### Phase 8: Frontend Pages (4-6 hours)

**Tasks:**
1. Create `MyEquipmentPage` for user's assigned equipment
2. Modify `InventoryManagement` page:
   - Add "Assigned To" column
   - Add "Assign" button to row actions
   - Add assignment filter chips
3. Integrate AssignmentDialog into InventoryManagement
4. Add equipment details enhancement with AssignmentCard

**Files to Create:**
- `frontend/src/pages/MyEquipmentPage.tsx`

**Files to Modify:**
- `frontend/src/pages/InventoryManagement.tsx`
- `frontend/src/App.tsx` (add route for MyEquipmentPage)

### Phase 9: Integration & Testing (4-6 hours)

**Tasks:**
1. End-to-end testing:
   - Assign equipment to user
   - Assign equipment to room
   - Unassign equipment
   - Transfer equipment
   - View assignment history
2. Test permission enforcement
3. Test error handling
4. Test edge cases (disposed equipment, invalid users, etc.)
5. Performance testing (bulk operations)

### Phase 10: Documentation & Deployment (2 hours)

**Tasks:**
1. Update API documentation
2. Update user documentation
3. Create migration guide for existing data
4. Review security checklist
5. Deploy to staging environment
6. Final QA verification

---

## Dependencies

### Backend Dependencies (Already Installed)
- ✅ Express
- ✅ Prisma ORM
- ✅ TypeScript
- ✅ Zod (validation)
- ✅ Winston/Pino (logging)
- ✅ JWT authentication
- ✅ Helmet (security headers)

### Frontend Dependencies (Already Installed)
- ✅ React 18
- ✅ Material-UI (MUI)
- ✅ TanStack Query (React Query)
- ✅ Axios
- ✅ React Router v6

### Additional Dependencies - NONE REQUIRED
All necessary dependencies are already installed.

### Development Dependencies
- ✅ Vitest (testing)
- ✅ ESLint
- ✅ Prettier

---

## Migration Strategy

### Handling Existing Equipment Records

**Current State:**
- Existing equipment records in database
- `assignedToUserId` and `roomId` fields exist but are NULL for all records
- No assignment history exists

**Migration Approach:**

**Option 1: Clean Start (RECOMMENDED)**
- No migration needed
- Existing equipment remains unassigned
- Users manually assign equipment going forward
- Assignment history starts from implementation date

**Option 2: Bulk Import from External Source**
If there's an existing assignment tracking system (e.g., Excel spreadsheet):

```typescript
// Migration script: backend/scripts/import-assignments.ts

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

async function migrateAssignments() {
  const prisma = new PrismaClient();
  
  // Read Excel file with existing assignments
  const workbook = XLSX.readFile('./assignments.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);
  
  for (const row of data) {
    const equipment = await prisma.equipment.findUnique({
      where: { assetTag: row.assetTag },
    });
    
    if (!equipment) continue;
    
    const user = await prisma.user.findUnique({
      where: { email: row.assignedToEmail },
    });
    
    if (user) {
      // Update equipment
      await prisma.equipment.update({
        where: { id: equipment.id },
        data: { assignedToUserId: user.id },
      });
      
      // Create history record
      await prisma.equipmentAssignmentHistory.create({
        data: {
          equipmentId: equipment.id,
          assignmentType: 'user',
          assignedToId: user.id,
          assignedToType: 'User',
          assignedToName: user.displayName || user.email,
          assignedBy: 'SYSTEM_MIGRATION',
          assignedByName: 'System Migration',
          equipmentName: equipment.name,
          equipmentTag: equipment.assetTag,
          notes: 'Migrated from legacy system',
          assignedAt: new Date(row.assignedDate || Date.now()),
        },
      });
    }
  }
  
  logger.info('Assignment migration completed');
}

migrateAssignments();
```

### Database Rollback Plan

If issues arise, the system can be rolled back:

```sql
-- Rollback: Drop assignment history table
DROP TABLE IF EXISTS equipment_assignment_history;

-- Rollback: Clear assignment fields
UPDATE equipment SET assigned_to_user_id = NULL, room_id = NULL;

-- Rollback: Prisma migration
npx prisma migrate reset
```

---

## Testing Approach

### Unit Tests

**Backend Service Tests:**
```typescript
// backend/src/services/assignment.service.test.ts

describe('AssignmentService', () => {
  describe('assignToUser', () => {
    it('should assign equipment to user successfully', async () => {
      // Test successful assignment
    });
    
    it('should throw error if equipment not found', async () => {
      // Test NotFoundError
    });
    
    it('should throw error if user not found', async () => {
      // Test NotFoundError
    });
    
    it('should throw error if equipment is disposed', async () => {
      // Test ValidationError
    });
    
    it('should create assignment history record', async () => {
      // Verify history record created
    });
    
    it('should update equipment status to assigned', async () => {
      // Verify status change
    });
  });
  
  describe('unassign', () => {
    it('should unassign equipment from user', async () => {
      // Test unassignment
    });
    
    it('should update history record with unassignedAt', async () => {
      // Verify history updated
    });
  });
  
  describe('transfer', () => {
    it('should transfer equipment from one user to another', async () => {
      // Test transfer
    });
    
    it('should throw error if fromUserId does not match current assignment', async () => {
      // Test validation
    });
  });
});
```

**Frontend Component Tests:**
```typescript
// frontend/src/components/equipment/AssignmentDialog.test.tsx

describe('AssignmentDialog', () => {
  it('should render with equipment information', () => {
    // Test rendering
  });
  
  it('should show user autocomplete when "User" is selected', () => {
    // Test conditional rendering
  });
  
  it('should show room dropdown when "Room" is selected', () => {
    // Test conditional rendering
  });
  
  it('should validate required fields', () => {
    // Test validation
  });
  
  it('should call API on submit', async () => {
    // Test API call
  });
  
  it('should display error message on failure', async () => {
    // Test error handling
  });
});
```

### Integration Tests

**E2E Assignment Flow:**
```typescript
describe('Equipment Assignment E2E', () => {
  it('should complete full assignment workflow', async () => {
    // 1. Login as admin
    // 2. Navigate to inventory
    // 3. Click "Assign" on equipment
    // 4. Select user
    // 5. Submit assignment
    // 6. Verify success message
    // 7. Verify equipment shows assignee
    // 8. Verify assignment history
  });
  
  it('should enforce permissions', async () => {
    // 1. Login as viewer (no inventory:write)
    // 2. Attempt to assign equipment
    // 3. Verify 403 error
  });
});
```

### Manual Testing Checklist

- [ ] Assign equipment to user (happy path)
- [ ] Assign equipment to room (happy path)
- [ ] Unassign equipment
- [ ] Transfer equipment between users
- [ ] Try to assign disposed equipment (should fail)
- [ ] Try to assign to non-existent user (should fail)
- [ ] View assignment history
- [ ] Filter equipment by assigned user
- [ ] View "My Equipment" page as regular user
- [ ] Bulk assign multiple equipment items
- [ ] Test with different user roles (Admin, Staff, Viewer)
- [ ] Test responsive design on mobile
- [ ] Test accessibility (keyboard navigation, screen readers)

---

## Potential Risks & Mitigations

### Risk 1: Performance Issues with Large Datasets

**Description:** Assignment history table could grow very large over time, impacting query performance.

**Likelihood:** Medium  
**Impact:** Medium

**Mitigation:**
- Add database indexes on frequently queried fields:
  - `equipmentId`
  - `assignedToId` + `assignedToType` (composite index)
  - `assignedAt`
- Implement pagination on all history queries
- Consider archiving old history records (>7 years) to separate table
- Use database query optimization (EXPLAIN ANALYZE)

### Risk 2: Concurrent Assignment Conflicts

**Description:** Two users might try to assign the same equipment simultaneously, causing race conditions.

**Likelihood:** Low  
**Impact:** High

**Mitigation:**
- Use database transactions for assignment operations
- Implement optimistic locking with version field
- Add database-level constraint to prevent double assignments
- Return clear error message if conflict occurs

**Implementation:**
```typescript
// Use Prisma transaction
await prisma.$transaction(async (tx) => {
  // Check current assignment
  const current = await tx.equipment.findUnique({
    where: { id: equipmentId },
  });
  
  if (current.assignedToUserId && strict) {
    throw new ValidationError('Equipment already assigned');
  }
  
  // Update equipment
  await tx.equipment.update({
    where: { id: equipmentId },
    data: { assignedToUserId: userId },
  });
  
  // Create history
  await tx.equipmentAssignmentHistory.create({ ... });
});
```

### Risk 3: Orphaned Assignments (User/Room Deleted)

**Description:** If a user or room is deleted, equipment might still reference them.

**Likelihood:** Medium  
**Impact:** Low

**Mitigation:**
- Database foreign key constraints with `ON DELETE SET NULL`
- Already implemented: `equipment.assignedToUser` relation
- Add cleanup job to unassign equipment when user is deactivated
- UI should show "(User Deleted)" if assignee no longer exists

### Risk 4: Permission Escalation

**Description:** Users might try to bypass permission checks to assign equipment.

**Likelihood:** Low  
**Impact:** High

**Mitigation:**
- ✅ All endpoints protected by authentication middleware
- ✅ Permission checks on all assignment operations
- ✅ Backend validation (never trust frontend)
- ✅ Audit logging of all assignment operations
- Regular security audits

### Risk 5: Incomplete Assignment History

**Description:** System failures might cause assignments to be updated without history records.

**Likelihood:** Low  
**Impact:** Medium

**Mitigation:**
- Use database transactions (atomic operations)
- Add post-deployment consistency check script
- Implement monitoring/alerts for missing history records
- Allow manual history correction by admins

### Risk 6: UI/UX Confusion

**Description:** Users might not understand the difference between location, room, and user assignments.

**Likelihood:** Medium  
**Impact:** Low

**Mitigation:**
- Clear labels and help text in UI
- Visual hierarchy: Location > Room > User
- Tooltips explaining each assignment type
- User documentation and training
- In-app help/guide

### Risk 7: API Rate Limiting

**Description:** Bulk assignment operations might trigger rate limiting.

**Likelihood:** Low  
**Impact:** Low

**Mitigation:**
- Exclude bulk operations from strict rate limiting
- Implement separate rate limit for bulk endpoints (e.g., 10 req/hour)
- Provide batch processing for large assignment jobs
- Show progress indicator for bulk operations

---

## Appendix A: API Endpoint Reference

### Summary Table

| Method | Endpoint | Auth Required | Permission | Description |
|--------|----------|---------------|------------|-------------|
| POST | `/api/equipment/:id/assign/user` | Yes | inventory:write | Assign equipment to user |
| POST | `/api/equipment/:id/assign/room` | Yes | inventory:write | Assign equipment to room |
| POST | `/api/equipment/:id/unassign` | Yes | inventory:write | Unassign equipment |
| POST | `/api/equipment/:id/transfer` | Yes | inventory:write | Transfer between users |
| GET | `/api/equipment/:id/assignment-history` | Yes | inventory:read | Get assignment history |
| GET | `/api/users/:userId/equipment` | Yes | inventory:read | Get user's equipment |
| GET | `/api/rooms/:roomId/equipment` | Yes | inventory:read | Get room's equipment |
| GET | `/api/equipment/available` | Yes | inventory:read | Get available equipment |
| POST | `/api/equipment/bulk-assign` | Yes | inventory:admin | Bulk assign equipment |

---

## Appendix B: Database Schema SQL

```sql
-- Create equipment_assignment_history table
CREATE TABLE equipment_assignment_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  assignment_type VARCHAR(50) NOT NULL, -- 'user', 'room', 'location', 'unassign'
  assigned_to_id UUID,
  assigned_to_type VARCHAR(50), -- 'User', 'Room', 'OfficeLocation'
  assigned_to_name VARCHAR(255) NOT NULL,
  assigned_by UUID NOT NULL REFERENCES users(id),
  assigned_by_name VARCHAR(255) NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  unassigned_at TIMESTAMP,
  notes TEXT,
  equipment_name VARCHAR(255) NOT NULL,
  equipment_tag VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_assignment_history_equipment ON equipment_assignment_history(equipment_id);
CREATE INDEX idx_assignment_history_assigned_to ON equipment_assignment_history(assigned_to_id, assigned_to_type);
CREATE INDEX idx_assignment_history_assigned_by ON equipment_assignment_history(assigned_by);
CREATE INDEX idx_assignment_history_assigned_at ON equipment_assignment_history(assigned_at);

-- Add comment
COMMENT ON TABLE equipment_assignment_history IS 'Immutable audit trail of all equipment assignments';
```

---

## Appendix C: Frontend Route Structure

```
/inventory
  ├─ /                          # Inventory list (existing)
  ├─ /:id                        # Equipment details (existing)
  └─ /my-equipment              # User's assigned equipment (NEW)

Component Hierarchy:
InventoryManagement
  ├─ InventoryTable
  │   ├─ AssignmentDialog      # NEW
  │   └─ Row Actions
  │       └─ Assign Button     # NEW
  └─ Filters

EquipmentDetails
  ├─ BasicInfo
  ├─ AssignmentCard            # NEW
  │   ├─ UnassignButton
  │   ├─ TransferButton
  │   └─ ViewHistoryButton
  └─ AssignmentHistoryList     # NEW

MyEquipmentPage               # NEW
  ├─ EquipmentGrid/Table
  └─ Filters
```

---

## Appendix D: Configuration Files

### Environment Variables (No New Variables Required)

Existing variables are sufficient:
- `DATABASE_URL` - PostgreSQL connection
- `JWT_SECRET` - JWT signing key
- `ENTRA_CLIENT_ID` - Azure AD client ID
- `ENTRA_TENANT_ID` - Azure AD tenant ID

### Prisma Schema Changes

```prisma
// backend/prisma/schema.prisma

// Add to equipment model
model equipment {
  // ... existing fields
  assignmentHistory      EquipmentAssignmentHistory[]  // NEW
}

// Add to User model
model User {
  // ... existing fields
  assignmentHistory      EquipmentAssignmentHistory[]  // NEW
}

// NEW: Assignment History model
model EquipmentAssignmentHistory {
  id              String    @id @default(uuid())
  equipmentId     String
  assignmentType  String
  assignedToId    String?
  assignedToType  String?
  assignedToName  String
  assignedBy      String
  assignedByName  String
  assignedAt      DateTime  @default(now())
  unassignedAt    DateTime?
  notes           String?
  equipmentName   String
  equipmentTag    String
  createdAt       DateTime  @default(now())
  
  equipment       equipment @relation(fields: [equipmentId], references: [id], onDelete: Cascade)
  user            User      @relation(fields: [assignedBy], references: [id])
  
  @@index([equipmentId])
  @@index([assignedToId, assignedToType])
  @@index([assignedBy])
  @@index([assignedAt])
  @@map("equipment_assignment_history")
}
```

---

## Appendix E: User Stories

### User Story 1: Assign Equipment to User
**As** an inventory manager  
**I want** to assign equipment to a specific user  
**So that** I can track who is responsible for each piece of equipment

**Acceptance Criteria:**
- [ ] I can search for users by name or email
- [ ] I can select a user from the search results
- [ ] I can optionally add notes about the assignment
- [ ] The system confirms the assignment was successful
- [ ] The equipment now shows the user's name in the "Assigned To" column
- [ ] An audit log entry is created

### User Story 2: View My Assigned Equipment
**As** a regular user  
**I want** to view a list of equipment assigned to me  
**So that** I know what I'm responsible for

**Acceptance Criteria:**
- [ ] I can access "My Equipment" from the navigation menu
- [ ] I see a list of all equipment currently assigned to me
- [ ] I can search and filter my equipment
- [ ] I can view details of each item
- [ ] I can report issues with my equipment

### User Story 3: Unassign Equipment
**As** an inventory manager  
**I want** to unassign equipment when it's returned  
**So that** it becomes available for reassignment

**Acceptance Criteria:**
- [ ] I can click "Unassign" from the equipment details page
- [ ] The system asks for confirmation
- [ ] I can optionally add notes about why it's being unassigned
- [ ] The equipment status changes to "Available"
- [ ] The assignment history is updated

### User Story 4: Transfer Equipment Between Users
**As** an inventory manager  
**I want** to transfer equipment from one user to another  
**So that** I can reassign equipment efficiently

**Acceptance Criteria:**
- [ ] I can click "Transfer" from the equipment details page
- [ ] The system shows the current assignee
- [ ] I can search for and select a new assignee
- [ ] The transfer is recorded in the assignment history
- [ ] Both users are notified of the transfer (future enhancement)

### User Story 5: View Assignment History
**As** an inventory manager  
**I want** to view the complete assignment history of equipment  
**So that** I can track equipment custody over time

**Acceptance Criteria:**
- [ ] I can view a timeline of all assignments for a piece of equipment
- [ ] Each entry shows: assignee, assigned by, date, notes
- [ ] I can export the history to CSV
- [ ] The history is immutable (cannot be edited)

---

## Conclusion

This specification provides a comprehensive roadmap for implementing equipment assignment functionality in the Tech-V2 application. The design leverages existing database schema fields, follows established patterns in the codebase, and adheres to security best practices.

**Key Takeaways:**
- ✅ Database schema already supports assignments (minimal changes needed)
- ✅ Room and User models exist with proper relations
- ✅ Implementation focuses on business logic, API endpoints, and UI
- ✅ Security standards from codebase audit are maintained
- ✅ Backward compatible with existing inventory system
- ✅ Scalable architecture for future enhancements

**Estimated Implementation Time:**
- Backend: 15-20 hours
- Frontend: 20-25 hours
- Testing & QA: 10-15 hours
- **Total: 45-60 hours (6-8 business days)**

**Next Steps:**
1. Review and approve specification
2. Begin Phase 1: Database schema changes
3. Proceed with backend implementation
4. Develop frontend components
5. Integration testing
6. Deployment to staging
7. User acceptance testing
8. Production deployment

---

**Document Status:** ✅ Ready for Implementation  
**Last Updated:** February 20, 2026  
**Specification Version:** 1.0
