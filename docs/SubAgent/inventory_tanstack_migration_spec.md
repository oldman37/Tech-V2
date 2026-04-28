# M4 — TanStack Query Migration: InventoryManagement.tsx

**Created:** 2026-03-04  
**Target file:** `frontend/src/pages/InventoryManagement.tsx`  
**TanStack Query version:** `@tanstack/react-query ^5.90.16`

---

## 1. Current State Analysis

### 1.1 File Stats

| Metric | Value |
|---|---|
| Path | `frontend/src/pages/InventoryManagement.tsx` |
| Total lines | 517 |
| useState hooks | 13 variables |
| useEffect hooks | 2 |
| Inline async functions | 4 (fetchInventory, fetchStats, handleDelete, handleReactivate) |
| Child dialogs rendered | 4 |

---

### 1.2 All `useState` Variables

| Variable | Type | Purpose | Stays local after migration? |
|---|---|---|---|
| `items` | `InventoryItem[]` | Current page of items from the API | ❌ Replaced by `useQuery.data` |
| `loading` | `boolean` | Fetch-in-progress spinner | ❌ Replaced by `useQuery.isLoading` |
| `error` | `string \| null` | Fetch/mutation error message | ❌ Replaced by `useQuery.error` / mutation `onError` |
| `total` | `number` | Total record count for pagination | ❌ Derived from `useQuery.data.total` |
| `paginationModel` | `{ page: number; pageSize: number }` | Page index and page size | ✅ Stays (controls query params) |
| `formDialogOpen` | `boolean` | InventoryFormDialog visibility | ✅ Stays (UI-only) |
| `historyDialogOpen` | `boolean` | InventoryHistoryDialog visibility | ✅ Stays (UI-only) |
| `importDialogOpen` | `boolean` | ImportInventoryDialog visibility | ✅ Stays (UI-only) |
| `assignmentDialogOpen` | `boolean` | AssignmentDialog visibility | ✅ Stays (UI-only) |
| `selectedItem` | `InventoryItem \| null` | Item being edited/viewed in a dialog | ✅ Stays (UI-only) |
| `filters` | `InventoryFilters` | search, status, isDisposed filter state | ✅ Stays (controls query params) |
| `stats` | `InventoryStatistics \| null` | Summary stats for the header cards | ❌ Replaced by `useQuery.data` |
| `exporting` | `boolean` | Export-in-progress button state | ⚠️ Can be replaced by `useMutation.isPending`, or kept |

---

### 1.3 All `useEffect` Hooks

| # | Deps | What it does | Replacement |
|---|---|---|---|
| 1 | `[paginationModel, filters]` | Calls `fetchInventory()` on every page or filter change | `useQuery` with `queryKey` including pagination + filters; auto-refetches when deps change |
| 2 | `[]` | Calls `fetchStats()` once on mount | `useQuery` with `staleTime: 5 * 60 * 1000` (already used this way in `Dashboard.tsx`) |

---

### 1.4 All Data-Fetching Functions

| Function | Service call | HTTP | Replacement |
|---|---|---|---|
| `fetchInventory()` | `inventoryService.getInventory({ page+1, limit, ...filters })` | `GET /inventory?...` | `useInventoryList` query hook |
| `fetchStats()` | `inventoryService.getStats()` | `GET /inventory/stats` | `useInventoryStats` query hook |

---

### 1.5 All Mutation Functions

| Function | Service call | HTTP | Replacement |
|---|---|---|---|
| `handleDelete(item)` | `inventoryService.deleteItem(item.id)` | `DELETE /inventory/:id` | `useDeleteInventoryItem` mutation |
| `handleReactivate(item)` | `inventoryService.updateItem(id, { isDisposed: false, status: 'active', ... })` | `PUT /inventory/:id` | `useUpdateInventoryItem` mutation |
| `handleExport()` | `inventoryService.exportInventory({ format: 'xlsx', filters })` | `POST /inventory/export` → Blob download | `useExportInventory` mutation OR keep inline with `exporting` state |
| `handleFormSuccess()` | calls `fetchInventory()` + `fetchStats()` | — | `queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all })` |
| `handleImportSuccess()` | calls `fetchInventory()` + `fetchStats()` | — | `queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all })` |
| `handleAssignmentSuccess()` | calls `fetchInventory()` | — | `queryClient.invalidateQueries({ queryKey: queryKeys.inventory.lists() })` |

> **Note:** `handleCreate`, `handleEdit`, `handleViewHistory`, `handleAssign` are pure UI state setters — no API calls, no migration needed.

---

### 1.6 Child Components / Dialogs

| Component | Import path | Data source | Notes |
|---|---|---|---|
| `InventoryFormDialog` | `../components/inventory/InventoryFormDialog` | Receives `item` prop (from `selectedItem`) | `onSuccess` triggers `handleFormSuccess` |
| `InventoryHistoryDialog` | `../components/inventory/InventoryHistoryDialog` | Receives `item` prop | Likely fetches its own history internally |
| `ImportInventoryDialog` | `../components/inventory/ImportInventoryDialog` | Self-contained | Manages its own import job polling internally; `onSuccess` triggers `handleImportSuccess` |
| `AssignmentDialog` | `../components/inventory/AssignmentDialog` (named export) | Receives `equipment` prop | `onSuccess` triggers `handleAssignmentSuccess` |

---

## 2. TanStack Query Patterns in This Project

### 2.1 Infrastructure

| File | Purpose |
|---|---|
| `frontend/src/lib/queryClient.ts` | Global `QueryClient` with `staleTime: 30s`, `gcTime: 5min`, retry: 3, centralized `QueryCache`/`MutationCache` error logging |
| `frontend/src/lib/queryKeys.ts` | Centralized type-safe query key factory |
| `frontend/src/main.tsx` | `<QueryClientProvider client={queryClient}>` wraps the entire app — confirmed present |

### 2.2 Existing Query Key Definitions for Inventory

Already defined in `queryKeys.ts` — **no additions needed**:

```typescript
inventory: {
  all: ['inventory'] as const,
  lists: () => [...queryKeys.inventory.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...queryKeys.inventory.lists(), params] as const,
  stats: () => [...queryKeys.inventory.all, 'stats'] as const,
  detail: (id: string) => [...queryKeys.inventory.all, 'detail', id] as const,
  history: (id: string) => [...queryKeys.inventory.all, 'history', id] as const,
},
```

### 2.3 Query Hook Pattern (`hooks/queries/`)

From `useUsers.ts` — the established convention:

```typescript
// File: src/hooks/queries/useUsers.ts
import { useQuery, UseQueryOptions, keepPreviousData } from '@tanstack/react-query';
import { userService, ... } from '@/services/userService';
import { queryKeys } from '@/lib/queryKeys';

export function useUsers(page, limit, search, options?) {
  return useQuery({
    queryKey: queryKeys.users.list(page, limit, search),
    queryFn: () => userService.getUsers(page, limit, search),
    placeholderData: keepPreviousData,   // ← paginated queries use this
    ...options,
  });
}
```

**Key conventions:**
- `placeholderData: keepPreviousData` for paginated queries (prevents flash-of-empty)
- `staleTime` override for rarely-changing data (e.g., permissions use `10 * 60 * 1000`)
- `options?` spread for per-callsite overrides
- `enabled: !!id` guard for conditional queries

### 2.4 Mutation Hook Pattern (`hooks/mutations/`)

From `useLocationMutations.ts` — simple invalidation pattern:

```typescript
// File: src/hooks/mutations/useLocationMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import locationService from '@/services/location.service';
import { queryKeys } from '@/lib/queryKeys';

export function useCreateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLocationRequest) => locationService.createLocation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
    },
    onError: (error: Error) => {
      console.error('Failed to create location:', error);
    },
  });
}
```

From `useUserMutations.ts` — optimistic update pattern (for role changes):

```typescript
export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ...,
    onMutate: async ({ userId, role }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.users.lists() });
      const previousUsers = queryClient.getQueriesData({ queryKey: queryKeys.users.lists() });
      queryClient.setQueriesData(...); // optimistic cache update
      return { previousUsers }; // rollback context
    },
    onError: (err, _, context) => {
      context?.previousUsers?.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
    },
  });
}
```

**Key conventions:**
- `useQueryClient()` called at top of each hook
- `onSuccess` → `queryClient.invalidateQueries({ queryKey: ... })`
- Invalidate the entity's `all` key to sweep all related list/detail/stats queries
- Optimistic updates used selectively (role/status toggles), **not** needed for inventory CRUD
- Hooks are **exported functions**, one mutation per function
- Consumed in components as: `const deleteMutation = useDeleteInventoryItem(); deleteMutation.mutate(id);`

### 2.5 Inline `useQuery` Pattern (Dashboard.tsx)

When the component is simple, `useQuery` may be inlined directly (no custom hook file):

```typescript
// Dashboard.tsx — inline useQuery, no custom hook
const { data: stats } = useQuery({
  queryKey: queryKeys.inventory.stats(),
  queryFn: () => inventoryService.getStats(),
  staleTime: 5 * 60 * 1000,
  retry: false,
});
```

The `InventoryManagement.tsx` migration should **follow the custom hook pattern** (`hooks/queries/` + `hooks/mutations/`) for consistency with Users and Locations pages.

---

## 3. Migration Plan

### 3.1 New Files to Create

#### `frontend/src/hooks/queries/useInventory.ts`

```typescript
import { useQuery, UseQueryOptions, keepPreviousData } from '@tanstack/react-query';
import inventoryService from '@/services/inventory.service';
import {
  InventoryListResponse,
  InventoryStatistics,
  InventoryFilters,
} from '@/types/inventory.types';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Hook for fetching paginated inventory list
 * Refetches automatically when params change.
 */
export function useInventoryList(
  page: number,
  pageSize: number,
  filters: InventoryFilters,
  options?: Omit<UseQueryOptions<InventoryListResponse>, 'queryKey' | 'queryFn'>
) {
  const params = { page, limit: pageSize, ...filters };
  return useQuery({
    queryKey: queryKeys.inventory.list(params as Record<string, unknown>),
    queryFn: () => inventoryService.getInventory(params),
    placeholderData: keepPreviousData, // No flash-of-empty during page change
    ...options,
  });
}

/**
 * Hook for fetching inventory statistics
 * Long staleTime — stats don't need to be fresh every 30s.
 */
export function useInventoryStats(
  options?: Omit<UseQueryOptions<InventoryStatistics>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.inventory.stats(),
    queryFn: () => inventoryService.getStats(),
    staleTime: 5 * 60 * 1000, // 5 minutes — matches Dashboard.tsx
    ...options,
  });
}
```

#### `frontend/src/hooks/mutations/useInventoryMutations.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import inventoryService from '@/services/inventory.service';
import {
  UpdateInventoryRequest,
  CreateInventoryRequest,
  ExportOptions,
} from '@/types/inventory.types';
import { queryKeys } from '@/lib/queryKeys';

/** Dispose (soft-delete) an inventory item */
export function useDeleteInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inventoryService.deleteItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    },
    onError: (error: Error) => {
      console.error('Failed to dispose item:', error);
    },
  });
}

/** Update an existing inventory item (includes reactivation) */
export function useUpdateInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateInventoryRequest }) =>
      inventoryService.updateItem(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.detail(id) });
    },
    onError: (error: Error) => {
      console.error('Failed to update item:', error);
    },
  });
}

/** Create a new inventory item */
export function useCreateInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInventoryRequest) => inventoryService.createItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    },
    onError: (error: Error) => {
      console.error('Failed to create item:', error);
    },
  });
}

/** Export inventory to Excel/CSV — triggers file download via blob */
export function useExportInventory() {
  return useMutation({
    mutationFn: (options: ExportOptions) => inventoryService.exportInventory(options),
    // No cache invalidation — export is read-only
    onError: (error: Error) => {
      console.error('Failed to export inventory:', error);
    },
  });
}

/** Bulk update multiple inventory items */
export function useBulkUpdateInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemIds, updates }: { itemIds: string[]; updates: UpdateInventoryRequest }) =>
      inventoryService.bulkUpdate(itemIds, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    },
    onError: (error: Error) => {
      console.error('Failed to bulk update items:', error);
    },
  });
}
```

---

### 3.2 Changes to `InventoryManagement.tsx`

#### Remove these imports
```typescript
// REMOVE:
import { useState, useEffect } from 'react';
// KEEP useState (still used for local UI state)
// ADD:
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useInventoryList, useInventoryStats } from '../hooks/queries/useInventory';
import { useDeleteInventoryItem, useUpdateInventoryItem, useExportInventory } from '../hooks/mutations/useInventoryMutations';
import { queryKeys } from '../lib/queryKeys';
```

#### Remove these `useState` declarations (7 variables removed)
```typescript
// REMOVE all of these:
const [items, setItems] = useState<InventoryItem[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [total, setTotal] = useState(0);
const [stats, setStats] = useState<InventoryStatistics | null>(null);
const [exporting, setExporting] = useState(false);
// Also remove the InventoryStatistics import if no longer needed directly
```

#### Replace `useEffect` + `fetchInventory` + `fetchStats` with hook calls
```typescript
// REMOVE both useEffects and both fetch functions entirely.

// ADD after the remaining useState declarations:
const queryClient = useQueryClient();

const {
  data: listData,
  isLoading: loading,
  error: listError,
} = useInventoryList(paginationModel.page + 1, paginationModel.pageSize, filters);

const items = listData?.items ?? [];
const total = listData?.total ?? 0;

const { data: stats } = useInventoryStats();

const deleteMutation = useDeleteInventoryItem();
const updateMutation = useUpdateInventoryItem();
const exportMutation = useExportInventory();

const error = listError ? (listError as any)?.response?.data?.message ?? 'Failed to fetch inventory' : null;
```

#### Replace `handleDelete`
```typescript
// REMOVE:
const handleDelete = async (item: InventoryItem) => {
  if (!window.confirm(...)) return;
  try {
    await inventoryService.deleteItem(item.id);
    fetchInventory();
    fetchStats();
  } catch (err: any) {
    alert(...);
  }
};

// ADD:
const handleDelete = (item: InventoryItem) => {
  if (!window.confirm(`Mark "${item.name}" (${item.assetTag}) as disposed?`)) return;
  deleteMutation.mutate(item.id, {
    onError: (err: any) => alert(err.response?.data?.message || 'Failed to delete item'),
  });
};
```

#### Replace `handleReactivate`
```typescript
// REMOVE:
const handleReactivate = async (item: InventoryItem) => {
  if (!window.confirm(...)) return;
  try {
    await inventoryService.updateItem(item.id, { ... });
    fetchInventory();
    fetchStats();
  } catch (err: any) {
    alert(...);
  }
};

// ADD:
const handleReactivate = (item: InventoryItem) => {
  if (!window.confirm(`Reactivate "${item.name}" (${item.assetTag}) and mark it as active?`)) return;
  updateMutation.mutate(
    { id: item.id, data: { isDisposed: false, status: 'active', disposedDate: null, disposedReason: null, disposalDate: null } },
    { onError: (err: any) => alert(err.response?.data?.message || 'Failed to reactivate item') }
  );
};
```

#### Replace `handleExport`
```typescript
// REMOVE:
const handleExport = async () => {
  setExporting(true);
  try {
    await inventoryService.exportInventory({ format: 'xlsx', filters });
  } catch (err) { setError(...); }
  finally { setExporting(false); }
};

// ADD:
const handleExport = () => {
  exportMutation.mutate({ format: 'xlsx', filters });
};
// Replace `exporting` with `exportMutation.isPending` in JSX
```

#### Replace `handleFormSuccess`, `handleImportSuccess`, `handleAssignmentSuccess`
```typescript
// REMOVE all three functions that call fetchInventory()/fetchStats().

// ADD:
const handleFormSuccess = () => {
  setFormDialogOpen(false);
  queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
};

const handleImportSuccess = () => {
  setImportDialogOpen(false);
  queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
};

const handleAssignmentSuccess = () => {
  setAssignmentDialogOpen(false);
  queryClient.invalidateQueries({ queryKey: queryKeys.inventory.lists() });
};
```

#### Update JSX references
```
exporting            → exportMutation.isPending
onClick={fetchInventory}  → onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.inventory.lists() })}
                           OR add refetch: const { ..., refetch } = useInventoryList(...) and onClick={refetch}
```

---

### 3.3 Unchanged Local State (Stays As-Is)

```typescript
const [paginationModel, setPaginationModel] = useState<PaginationModel>({ page: 0, pageSize: 50 });
const [formDialogOpen, setFormDialogOpen] = useState(false);
const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
const [importDialogOpen, setImportDialogOpen] = useState(false);
const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
const [filters, setFilters] = useState<InventoryFilters>({ search: '', status: undefined, isDisposed: false });
```

These drive query params and UI visibility — they are not server state and must remain local.

---

## 4. Complex Cases & Risk Assessment

### 4.1 Import Job Polling — ✅ LOW RISK (already isolated)

The Excel import flow (`ImportInventoryDialog`) uses polling internally:
```
POST /inventory/import → { jobId }
  → polling GET /inventory/import/:jobId until status = 'completed' | 'failed'
```

This polling lives **entirely inside `ImportInventoryDialog`**, not in `InventoryManagement.tsx`. The parent component only receives an `onSuccess` callback. After migration, `onSuccess` calls `queryClient.invalidateQueries` — no change to the dialog's internal logic. **No polling code needs to be touched.**

### 4.2 Export — ⚠️ MEDIUM (no real risk, just a choice)

`handleExport` triggers a blob download — not a cacheable server state operation. Two options:

**Option A (recommended):** Wrap in `useMutation` for consistent `isPending` state tracking  
**Option B:** Keep as local `async` function with `exporting` useState  

Option A is preferred for consistency. The `mutationFn` returns `void` (service downloads directly), so there is no `data` to cache.

### 4.3 Refresh Button — ✅ LOW RISK

Currently calls `fetchInventory()` imperatively. After migration, use `refetch()` from `useInventoryList`:

```typescript
const { data: listData, isLoading: loading, error: listError, refetch } = useInventoryList(...);
// ...
<button onClick={() => refetch()} ...>🔄 Refresh</button>
```

### 4.4 `keepPreviousData` for Pagination — ✅ LOW RISK

Without `keepPreviousData` (TanStack v5: `placeholderData: keepPreviousData`), changing page would flash an empty table. The existing `useUsers.ts` pattern already uses this correctly. `useInventoryList` must include it.

### 4.5 Stats Shared With Dashboard — ✅ BENEFIT

`Dashboard.tsx` already uses `queryKeys.inventory.stats()` with `staleTime: 5 * 60 * 1000`. After this migration, navigating from Dashboard → Inventory will serve stats from cache instantly. After any mutation (create/update/delete), `invalidateQueries({ queryKey: queryKeys.inventory.all })` will bust both the list cache AND the stats cache via the `['inventory']` prefix.

### 4.6 Error Handling Strategy

Current code uses a mix of:
- `setError(msg)` for fetch errors (shown in red banner)
- `alert(msg)` for mutation errors

After migration:
- List/stats fetch errors → `listError` from `useQuery`, still render the red banner
- Mutation errors → use per-call `onError` callback passed to `mutation.mutate(...)`, or push to a toast system if one is added
- The global `MutationCache.onError` in `queryClient.ts` already logs all errors to console

---

## 5. Line Count Estimate

| | Before | After |
|---|---|---|
| `InventoryManagement.tsx` | 517 lines | ~440 lines (−77) |
| `hooks/queries/useInventory.ts` | — | ~55 lines (new) |
| `hooks/mutations/useInventoryMutations.ts` | — | ~100 lines (new) |
| **Net total** | 517 | ~595 (but component is simpler) |

Removed from component:
- 6 useState declarations: ~6 lines
- 2 useEffect hooks: ~6 lines
- `fetchInventory` function: ~15 lines
- `fetchStats` function: ~8 lines
- `handleDelete` body: ~10 lines (simplified)
- `handleReactivate` body: ~14 lines (simplified)
- `handleExport` body: ~12 lines (simplified)
- `handleFormSuccess`, `handleImportSuccess`, `handleAssignmentSuccess` (3×5 lines): ~15 lines

---

## 6. Summary of Files Modified / Created

| Action | Path |
|---|---|
| **Modify** | `frontend/src/pages/InventoryManagement.tsx` |
| **Create** | `frontend/src/hooks/queries/useInventory.ts` |
| **Create** | `frontend/src/hooks/mutations/useInventoryMutations.ts` |
| **No change** | `frontend/src/lib/queryKeys.ts` — inventory keys already exist |
| **No change** | `frontend/src/services/inventory.service.ts` — service layer unchanged |
| **No change** | `frontend/src/types/inventory.types.ts` — types unchanged |
| **No change** | Dialog components (`InventoryFormDialog`, `InventoryHistoryDialog`, `ImportInventoryDialog`, `AssignmentDialog`) |

---

## 7. Implementation Checklist

- [ ] Create `frontend/src/hooks/queries/useInventory.ts` with `useInventoryList` and `useInventoryStats`
- [ ] Create `frontend/src/hooks/mutations/useInventoryMutations.ts` with `useDeleteInventoryItem`, `useUpdateInventoryItem`, `useCreateInventoryItem`, `useExportInventory`, `useBulkUpdateInventory`
- [ ] Update imports in `InventoryManagement.tsx`
- [ ] Remove 7 server-state `useState` variables
- [ ] Remove 2 `useEffect` hooks
- [ ] Remove `fetchInventory()` and `fetchStats()` functions
- [ ] Replace `handleDelete` with `deleteMutation.mutate()`
- [ ] Replace `handleReactivate` with `updateMutation.mutate()`
- [ ] Replace `handleExport` with `exportMutation.mutate()`
- [ ] Replace `handleFormSuccess` / `handleImportSuccess` / `handleAssignmentSuccess` with `queryClient.invalidateQueries`
- [ ] Replace `exporting` references in JSX with `exportMutation.isPending`
- [ ] Replace `onClick={fetchInventory}` refresh button with `onClick={() => refetch()}`
- [ ] Run `npx tsc --noEmit` in `frontend/` — confirm zero new type errors
- [ ] Verify: create item → list refreshes
- [ ] Verify: dispose item → list + stats refresh
- [ ] Verify: page change → no flash of empty table (`keepPreviousData`)
- [ ] Verify: import dialog → list refreshes after `onSuccess`
