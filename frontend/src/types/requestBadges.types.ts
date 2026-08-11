/**
 * Types for the Requests-nav unread-count badges.
 */

export type RequestSection =
  | 'WORK_ORDERS'
  | 'PURCHASE_ORDERS'
  | 'FIELD_TRIPS'
  | 'FIELD_TRIP_APPROVALS'
  | 'TRANSPORTATION_REQUESTS';

export type RequestBadgeCounts = Record<RequestSection, number>;
