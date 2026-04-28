# @mgspe/shared-types

Shared TypeScript types for the MGSPE (Municipal Growth & Sustainability Projection Engine) project.

## Overview

This package contains type definitions that are shared between the frontend and backend to ensure type consistency and reduce duplication across the codebase.

## Contents

- **types.ts** - Core domain types (User, Location, Room, Permission, etc.)
- **api-types.ts** - API request and response types

## Usage

### In Backend

```typescript
import { User, CreateLocationRequest, UpdateRoomRequest } from '@mgspe/shared-types';
```

### In Frontend

```typescript
import { UserWithPermissions, GetRoomsResponse } from '@mgspe/shared-types';
```

## Building

```bash
npm run build
```

## Development

```bash
npm run watch
```

## Type Categories

### Domain Types
- User, UserRole, UserWithPermissions
- OfficeLocation, LocationType, OfficeLocationWithSupervisors
- Room, RoomWithLocation
- Permission, PermissionModule, PermissionLevel
- Supervisor types and assignments

### API Types
- Request types for all API endpoints
- Response types for all API endpoints
- Paginated response wrappers
- Standard API response wrapper

## Benefits

1. **Single Source of Truth** - Types defined once, used everywhere
2. **Type Safety** - Compile-time checks across frontend and backend
3. **Consistency** - Ensures API contracts match between client and server
4. **Maintainability** - Update types in one place, changes propagate automatically
5. **Documentation** - Types serve as living documentation of the API
