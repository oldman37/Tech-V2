# Spec: Make Room Assignment Card Clickable

## Current State Analysis

`frontend/src/pages/RoomAssignments/RoomAssignmentsPage.tsx:352-390` renders each room as a `Card`.
Opening `RoomAssignmentDialog` (to manage that room's user assignments) is currently only wired to
the "Manage Assignments" `Button` inside `CardActions` (`onClick={() => setDialogRoom(room)}`,
line ~333). Clicking anywhere else on the card (the name, room type chip, building/floor text,
assigned-user count) does nothing.

## Problem Definition

Users expect the whole room card to be clickable to open the assignment dialog, not just the small
button at the bottom.

## Proposed Solution

Add an `onClick={() => setDialogRoom(room)}` handler directly to the `Card` component and a
`cursor: pointer` + subtle hover style via `sx`, so clicking anywhere on the card opens the same
dialog the button already opens. The button stays as-is (its own click also calls
`setDialogRoom(room)`, so it remains functionally identical — clicking the button just also
triggers the card's handler, which is idempotent since both set the same value).

This is a UI-only change (no new dependency, no backend/auth change), so per the Dependency &
Documentation Policy no external-library verification is required.

## Implementation Steps

1. `frontend/src/pages/RoomAssignments/RoomAssignmentsPage.tsx` — add `onClick` and hover `sx` to
   the `Card` in the room grid (~line 354).

## Files to be Modified

- `frontend/src/pages/RoomAssignments/RoomAssignmentsPage.tsx`

## Risks and Mitigations

- **Risk:** Clicking the "Manage Assignments" button now fires both the button's own `onClick` and
  bubbles up to the card's `onClick`. **Mitigation:** Both call the exact same
  `setDialogRoom(room)` with the same argument — calling it twice is a no-op difference in React
  state (same value set twice), no behavior change, no need for `stopPropagation`.
