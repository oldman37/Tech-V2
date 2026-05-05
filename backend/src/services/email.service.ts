/**
 * Email Service
 *
 * Nodemailer-based email notifications for the PO requisition workflow.
 * All sends are wrapped in try/catch — email failures are logged but never
 * thrown, because email is non-critical to workflow correctness.
 *
 * Environment variables required:
 *   SMTP_HOST     — SMTP server host (e.g., smtp.office365.com)
 *   SMTP_PORT     — SMTP server port (e.g., 587)
 *   SMTP_SECURE   — "true" for TLS, "false" for STARTTLS
 *   SMTP_USER     — SMTP auth username
 *   SMTP_PASS     — SMTP auth password
 *   SMTP_FROM     — From address (e.g., noreply@district.org)
 */

import nodemailer from 'nodemailer';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { graphClient } from '../config/entraId';
import { ExternalAPIError } from '../utils/errors';

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

/**
 * Escape user-supplied strings before embedding them in HTML email bodies.
 * Prevents XSS via crafted PO titles, vendor names, or denial reasons.
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// Transporter (singleton, created once on module load)
// ---------------------------------------------------------------------------

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT ?? '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM_ADDRESS = process.env.SMTP_FROM ?? 'noreply@district.org';

// ---------------------------------------------------------------------------
// Internal send helper
// ---------------------------------------------------------------------------

async function sendMail(options: {
  to:      string | string[];
  subject: string;
  html:    string;
}): Promise<void> {
  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  if (recipients.length === 0) return;

  try {
    await transporter.sendMail({
      from:    FROM_ADDRESS,
      to:      recipients.join(', '),
      subject: options.subject,
      html:    options.html,
    });
    const redacted = recipients.map((e) => e.replace(/^[^@]*/, '***')).join(', ');
    logger.info('Email sent', { to: redacted, subject: options.subject });
  } catch (error) {
    logger.error('Failed to send email', {
      subject: options.subject,
      error: error instanceof Error ? error.message : String(error),
    });
    // Intentionally not re-throwing — email is non-critical
  }
}

// ---------------------------------------------------------------------------
// PO detail HTML snippet (shared across templates)
// ---------------------------------------------------------------------------

function poDetailHtml(po: {
  id:          string;
  description: string;
  poNumber?:   string | null;
  amount:      any;
  vendors?:    { name: string } | null;
}): string {
  return `
    <table style="border-collapse:collapse;width:100%;margin-top:16px;">
      <tr><td style="padding:4px 8px;font-weight:bold;">PO Title:</td>
          <td style="padding:4px 8px;">${escapeHtml(po.description)}</td></tr>
      ${po.poNumber ? `<tr><td style="padding:4px 8px;font-weight:bold;">PO Number:</td>
          <td style="padding:4px 8px;">${escapeHtml(po.poNumber)}</td></tr>` : ''}
      <tr><td style="padding:4px 8px;font-weight:bold;">Vendor:</td>
          <td style="padding:4px 8px;">${po.vendors ? escapeHtml(po.vendors.name) : 'N/A'}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:bold;">Total Amount:</td>
          <td style="padding:4px 8px;">$${Number(po.amount).toFixed(2)}</td></tr>
    </table>
  `;
}

// ---------------------------------------------------------------------------
// Approver email snapshot
// ---------------------------------------------------------------------------

interface GraphMember {
  mail?: string;
  userPrincipalName?: string;
}

interface GraphMembersResponse {
  value: GraphMember[];
  '@odata.nextLink'?: string;
}

export async function fetchGroupEmails(groupId: string): Promise<string[]> {
  const emails: string[] = [];
  let nextLink: string | null = `/groups/${groupId}/members?$select=mail,userPrincipalName`;

  while (nextLink) {
    const response = await graphClient.api(nextLink).get() as GraphMembersResponse;
    for (const member of response.value) {
      const email = member.mail ?? member.userPrincipalName;
      if (email) emails.push(email);
    }
    nextLink = response['@odata.nextLink']
      ? (response['@odata.nextLink'].split('/v1.0')[1] ?? null)
      : null;
  }

  return emails;
}

/**
 * Build a snapshot of approver email addresses for a given requestor.
 * Supervisor emails are resolved from the DB; role-group emails are
 * fetched live from Microsoft Graph using the configured Entra group IDs.
 */
export async function buildApproverEmailSnapshot(requestorId: string): Promise<{
  supervisor: string[];
  finance: string[];
  dos: string[];
  poEntry: string[];
  fsPoEntry: string[];
  fsSupervisor: string[];
}> {
  const user = await prisma.user.findUnique({
    where: { id: requestorId },
    include: {
      user_supervisors_user_supervisors_userIdTousers: {
        include: {
          supervisor: {
            select: { email: true },
          },
        },
      },
    },
  });

  const supervisorEmails: string[] = user
    ? user.user_supervisors_user_supervisors_userIdTousers
        .map((us) => us.supervisor.email)
        .filter(Boolean)
    : [];

  const financeGroupId       = process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID;
  const dosGroupId           = process.env.ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID;
  const poEntryGroupId       = process.env.ENTRA_FINANCE_PO_ENTRY_GROUP_ID;
  const fsPoEntryGroupId     = process.env.ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID;
  const fsSupervisorGroupId  = process.env.ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID;

  try {
    const [finance, dos, poEntry, fsPoEntry, fsSupervisor] = await Promise.all([
      financeGroupId       ? fetchGroupEmails(financeGroupId)       : Promise.resolve([]),
      dosGroupId           ? fetchGroupEmails(dosGroupId)           : Promise.resolve([]),
      poEntryGroupId       ? fetchGroupEmails(poEntryGroupId)       : Promise.resolve([]),
      fsPoEntryGroupId     ? fetchGroupEmails(fsPoEntryGroupId)     : Promise.resolve([]),
      fsSupervisorGroupId  ? fetchGroupEmails(fsSupervisorGroupId)  : Promise.resolve([]),
    ]);

    return { supervisor: supervisorEmails, finance, dos, poEntry, fsPoEntry, fsSupervisor };
  } catch (error) {
    logger.error('Failed to fetch approver emails from Microsoft Graph', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ExternalAPIError(
      'Microsoft Graph',
      'Failed to retrieve approver group members',
      error,
    );
  }
}

// ---------------------------------------------------------------------------
// Public send functions
// ---------------------------------------------------------------------------

/**
 * Notify the supervisor that a new requisition is awaiting approval.
 * Called after submitPurchaseOrder().
 */
export async function sendRequisitionSubmitted(
  po: { id: string; description: string; amount: any; vendors?: { name: string } | null },
  toEmail: string | string[],
): Promise<void> {
  await sendMail({
    to:      toEmail,
    subject: `Requisition Approval Required: ${po.description}`,
    html: `
      <h2 style="color:#1565C0;">New Purchase Requisition Awaiting Your Approval</h2>
      <p>A new purchase requisition has been submitted and requires your review.</p>
      ${poDetailHtml(po)}
      <p style="margin-top:24px;">Please log in to the system to review and approve or deny this requisition.</p>
    `,
  });
}

/**
 * Notify the requestor that their PO was approved at a workflow stage.
 * Called after approvePurchaseOrder().
 */
export async function sendRequisitionApproved(
  po: { id: string; description: string; amount: any; vendors?: { name: string } | null },
  toEmail: string,
  stageName: string,
): Promise<void> {
  await sendMail({
    to:      toEmail,
    subject: `Requisition Approved (${stageName}): ${po.description}`,
    html: `
      <h2 style="color:#2E7D32;">Your Purchase Requisition Has Been Approved</h2>
      <p>Your requisition has advanced to the next stage: <strong>${escapeHtml(stageName)}</strong>.</p>
      ${poDetailHtml(po)}
      <p style="margin-top:24px;">No action is required from you at this time.</p>
    `,
  });
}

/**
 * Notify the next approver that a PO has advanced to their stage and requires action.
 * Called after submitPurchaseOrder() (self-supervisor bypass) and approvePurchaseOrder().
 */
export async function sendApprovalActionRequired(
  po: { id: string; description: string; amount: any; vendors?: { name: string } | null },
  toEmail: string | string[],
  stageName: string,
): Promise<void> {
  await sendMail({
    to:      toEmail,
    subject: `PO Approval Required (${stageName}): ${po.description}`,
    html: `
      <h2 style="color:#1565C0;">Purchase Requisition Awaiting ${escapeHtml(stageName)}</h2>
      <p>A purchase requisition has advanced to the <strong>${escapeHtml(stageName)}</strong>
         stage and requires your review and approval.</p>
      ${poDetailHtml(po)}
      <p style="margin-top:24px;">Please log in to the system to review and approve or deny this requisition.</p>
    `,
  });
}

/**
 * Notify the requestor that their PO was rejected.
 * Called after rejectPurchaseOrder().
 */
export async function sendRequisitionRejected(
  po: { id: string; description: string; amount: any; vendors?: { name: string } | null },
  toEmail: string,
  reason: string,
): Promise<void> {
  await sendMail({
    to:      toEmail,
    subject: `Requisition Denied: ${po.description}`,
    html: `
      <h2 style="color:#C62828;">Your Purchase Requisition Has Been Denied</h2>
      <p>We regret to inform you that your purchase requisition has been denied.</p>
      ${poDetailHtml(po)}
      <p style="margin-top:16px;"><strong>Reason for denial:</strong></p>
      <blockquote style="border-left:4px solid #C62828;margin:8px 0;padding:8px 16px;background:#FFEBEE;">
        ${escapeHtml(reason)}
      </blockquote>
      <p style="margin-top:16px;">If you believe this decision was made in error, please contact your supervisor.</p>
    `,
  });
}

/**
 * Notify the requestor that their PO has been issued with a PO number.
 * Called after issuePurchaseOrder().
 */
export async function sendPOIssued(
  po: { id: string; description: string; poNumber?: string | null; amount: any; vendors?: { name: string } | null },
  toEmail: string,
): Promise<void> {
  await sendMail({
    to:      toEmail,
    subject: `PO Issued: ${po.poNumber} — ${po.description}`,
    html: `
      <h2 style="color:#1565C0;">Your Purchase Order Has Been Issued</h2>
      <p>Your purchase requisition has been approved and issued with the following PO number:</p>
      <p style="font-size:24px;font-weight:bold;color:#1565C0;">${po.poNumber ? escapeHtml(po.poNumber) : ''}</p>
      ${poDetailHtml(po)}
      <p style="margin-top:24px;">Please reference this PO number when communicating with the vendor or making purchases.</p>
    `,
  });
}

// ---------------------------------------------------------------------------
// Work Order notification emails
// ---------------------------------------------------------------------------

/**
 * Notify a user that a work order has been assigned to them.
 * Called after auto-assignment on work order creation and manual assignment.
 * Email failures are logged but never block the main workflow.
 */
export async function sendWorkOrderAssigned(
  workOrder: {
    workOrderNumber: string;
    department: string;
    priority: string;
    locationName?: string | null;
    workOrderId?: string;
  },
  assigneeEmail: string,
  reportedByName: string,
): Promise<void> {
  const deptLabel = workOrder.department === 'TECHNOLOGY' ? 'Technology' : 'Maintenance';
  const deptColor = workOrder.department === 'TECHNOLOGY' ? '#1565C0' : '#E65100';

  await sendMail({
    to:      assigneeEmail,
    subject: `Work Order Assigned: ${workOrder.workOrderNumber}`,
    html: `
      <h2 style="color:${deptColor};">A ${escapeHtml(deptLabel)} Work Order Has Been Assigned to You</h2>
      <p>You have been assigned a new work order that requires your attention.</p>
      ${workOrder.workOrderId ? `<p style="margin-top:16px;"><a href="${escapeHtml(process.env.APP_URL ?? '')}/work-orders/${escapeHtml(workOrder.workOrderId)}" style="display:inline-block;padding:10px 20px;background-color:${deptColor};color:#ffffff;text-decoration:none;border-radius:4px;font-weight:bold;">View Work Order</a></p>` : ''}
      <table style="border-collapse:collapse;width:100%;margin-top:16px;">
        <tr><td style="padding:4px 8px;font-weight:bold;">Work Order #:</td>
            <td style="padding:4px 8px;">${escapeHtml(workOrder.workOrderNumber)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Department:</td>
            <td style="padding:4px 8px;">${escapeHtml(deptLabel)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Priority:</td>
            <td style="padding:4px 8px;">${escapeHtml(workOrder.priority)}</td></tr>
        ${workOrder.locationName ? `<tr><td style="padding:4px 8px;font-weight:bold;">Location:</td>
            <td style="padding:4px 8px;">${escapeHtml(workOrder.locationName)}</td></tr>` : ''}
        <tr><td style="padding:4px 8px;font-weight:bold;">Reported By:</td>
            <td style="padding:4px 8px;">${escapeHtml(reportedByName)}</td></tr>
      </table>
      <p style="margin-top:24px;">Please log in to the system to review the work order details and begin work.</p>
    `,
  });
}

// ---------------------------------------------------------------------------
// Field Trip approver email snapshot
// ---------------------------------------------------------------------------

export interface FieldTripApproverSnapshot {
  supervisorEmails: string[];
  asstDirectorEmails: string[];
  directorEmails: string[];
  financeDirectorEmails: string[];
}

/**
 * Build a snapshot of approver email addresses for a field trip submission.
 * Supervisor emails come from the DB; group emails are fetched from Microsoft Graph.
 * Throws ExternalAPIError if Graph is unreachable.
 */
export async function buildFieldTripApproverSnapshot(
  submitterId: string,
): Promise<FieldTripApproverSnapshot> {
  const user = await prisma.user.findUnique({
    where: { id: submitterId },
    include: {
      user_supervisors_user_supervisors_userIdTousers: {
        include: {
          supervisor: { select: { email: true } },
        },
      },
    },
  });

  const supervisorEmails: string[] = user
    ? user.user_supervisors_user_supervisors_userIdTousers
        .map((us) => us.supervisor.email)
        .filter(Boolean)
    : [];

  const asstDosGroupId   = process.env.ENTRA_ASST_DIRECTOR_OF_SCHOOLS_GROUP_ID;
  const dosGroupId       = process.env.ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID;
  const financeGroupId   = process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID;

  try {
    const [asstDirectorEmails, directorEmails, financeDirectorEmails] = await Promise.all([
      asstDosGroupId ? fetchGroupEmails(asstDosGroupId) : Promise.resolve([]),
      dosGroupId     ? fetchGroupEmails(dosGroupId)     : Promise.resolve([]),
      financeGroupId ? fetchGroupEmails(financeGroupId) : Promise.resolve([]),
    ]);

    return { supervisorEmails, asstDirectorEmails, directorEmails, financeDirectorEmails };
  } catch (error) {
    logger.error('Failed to fetch field trip approver emails from Microsoft Graph', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ExternalAPIError(
      'Microsoft Graph',
      'Failed to retrieve field trip approver group members',
      error,
    );
  }
}

// ---------------------------------------------------------------------------
// Field Trip detail HTML snippet (shared across templates)
// ---------------------------------------------------------------------------

function fieldTripDetailHtml(trip: {
  id:             string;
  destination:    string;
  tripDate:       Date | string;
  teacherName:    string;
  schoolBuilding: string;
  gradeClass:     string;
  studentCount:   number;
  purpose:        string;
}): string {
  const dateStr = new Date(trip.tripDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  return `
    <table style="border-collapse:collapse;width:100%;margin-top:16px;">
      <tr><td style="padding:4px 8px;font-weight:bold;">Destination:</td>
          <td style="padding:4px 8px;">${escapeHtml(trip.destination)}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:bold;">Trip Date:</td>
          <td style="padding:4px 8px;">${dateStr}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:bold;">Teacher / Sponsor:</td>
          <td style="padding:4px 8px;">${escapeHtml(trip.teacherName)}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:bold;">School / Building:</td>
          <td style="padding:4px 8px;">${escapeHtml(trip.schoolBuilding)}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:bold;">Grade / Class:</td>
          <td style="padding:4px 8px;">${escapeHtml(trip.gradeClass)}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:bold;">Number of Students:</td>
          <td style="padding:4px 8px;">${trip.studentCount}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:bold;vertical-align:top;">Educational Purpose:</td>
          <td style="padding:4px 8px;">${escapeHtml(trip.purpose)}</td></tr>
    </table>
  `;
}

// ---------------------------------------------------------------------------
// Field Trip notification emails
// ---------------------------------------------------------------------------

/**
 * Notify the supervisor that a new field trip is awaiting their approval.
 */
export async function sendFieldTripToSupervisor(
  supervisorEmail: string | string[],
  trip: {
    id: string; destination: string; tripDate: Date | string;
    teacherName: string; schoolBuilding: string; gradeClass: string;
    studentCount: number; purpose: string;
  },
  submitterName: string,
): Promise<void> {
  await sendMail({
    to:      supervisorEmail,
    subject: `Field Trip Approval Required: ${trip.destination} — ${new Date(trip.tripDate).toLocaleDateString('en-US')}`,
    html: `
      <h2 style="color:#1565C0;">Field Trip Request Awaiting Your Approval</h2>
      <p><strong>${escapeHtml(submitterName)}</strong> has submitted a field trip request that requires your approval.</p>
      ${fieldTripDetailHtml(trip)}
      <p style="margin-top:24px;">Please log in to the system to review and approve or deny this field trip request.</p>
    `,
  });
}

/**
 * Notify an approver that a field trip has advanced to their stage.
 * Used for Asst. Director, Director, and Finance Director stages.
 */
export async function sendFieldTripAdvancedToApprover(
  approverEmail: string | string[],
  trip: {
    id: string; destination: string; tripDate: Date | string;
    teacherName: string; schoolBuilding: string; gradeClass: string;
    studentCount: number; purpose: string;
  },
  submitterName: string,
  stageName: string,
): Promise<void> {
  await sendMail({
    to:      approverEmail,
    subject: `Field Trip Approval Required (${stageName}): ${trip.destination}`,
    html: `
      <h2 style="color:#1565C0;">Field Trip Request Awaiting ${escapeHtml(stageName)} Approval</h2>
      <p>A field trip request submitted by <strong>${escapeHtml(submitterName)}</strong> has advanced to
         the <strong>${escapeHtml(stageName)}</strong> stage and requires your review.</p>
      ${fieldTripDetailHtml(trip)}
      <p style="margin-top:24px;">Please log in to the system to review and approve or deny this field trip request.</p>
    `,
  });
}

/**
 * Notify the submitter that their field trip request has been fully approved.
 */
export async function sendFieldTripFinalApproved(
  submitterEmail: string,
  trip: {
    id: string; destination: string; tripDate: Date | string;
    teacherName: string; schoolBuilding: string; gradeClass: string;
    studentCount: number; purpose: string;
  },
): Promise<void> {
  await sendMail({
    to:      submitterEmail,
    subject: `Field Trip Approved: ${trip.destination} — ${new Date(trip.tripDate).toLocaleDateString('en-US')}`,
    html: `
      <h2 style="color:#2E7D32;">Your Field Trip Request Has Been Approved</h2>
      <p>Congratulations! Your field trip request has been fully approved by all required approvers.</p>
      ${fieldTripDetailHtml(trip)}
      <p style="margin-top:24px;">Please ensure all school policies and procedures are followed when conducting the field trip.</p>
    `,
  });
}

/**
 * Notify the submitter that their field trip request has been denied.
 */
export async function sendFieldTripDenied(
  submitterEmail: string,
  trip: {
    id: string; destination: string; tripDate: Date | string;
    teacherName: string; schoolBuilding: string; gradeClass: string;
    studentCount: number; purpose: string;
  },
  denierName: string,
  reason: string,
): Promise<void> {
  await sendMail({
    to:      submitterEmail,
    subject: `Field Trip Denied: ${trip.destination} — ${new Date(trip.tripDate).toLocaleDateString('en-US')}`,
    html: `
      <h2 style="color:#C62828;">Your Field Trip Request Has Been Denied</h2>
      <p>We regret to inform you that your field trip request has been denied by <strong>${escapeHtml(denierName)}</strong>.</p>
      ${fieldTripDetailHtml(trip)}
      <p style="margin-top:16px;"><strong>Reason for denial:</strong></p>
      <blockquote style="border-left:4px solid #C62828;margin:8px 0;padding:8px 16px;background:#FFEBEE;">
        ${escapeHtml(reason)}
      </blockquote>
      <p style="margin-top:16px;">If you believe this decision was made in error, please contact your supervisor.</p>
    `,
  });
}

/**
 * Notify the submitter that their field trip request has been sent back for revision.
 */
export async function sendFieldTripSentBack(
  submitterEmail: string,
  trip: {
    id: string; destination: string; tripDate: Date | string;
    teacherName: string; schoolBuilding: string; gradeClass: string;
    studentCount: number; purpose: string;
  },
  senderName: string,
  reason: string,
): Promise<void> {
  const appUrl = process.env.APP_URL ?? '';
  await sendMail({
    to:      submitterEmail,
    subject: `Field Trip Sent Back for Revision: ${trip.destination} — ${new Date(trip.tripDate).toLocaleDateString('en-US')}`,
    html: `
      <h2 style="color:#E65100;">Your Field Trip Request Has Been Sent Back for Revision</h2>
      <p><strong>${escapeHtml(senderName)}</strong> has sent your field trip request back for revision.</p>
      ${fieldTripDetailHtml(trip)}
      <p style="margin-top:16px;"><strong>Revision reason:</strong></p>
      <blockquote style="border-left:4px solid #E65100;margin:8px 0;padding:8px 16px;background:#FFF3E0;">
        ${escapeHtml(reason)}
      </blockquote>
      <p style="margin-top:16px;">Please log in to the system to review the feedback, make the necessary changes, and resubmit your request.</p>
      ${appUrl ? `<p style="margin-top:16px;"><a href="${escapeHtml(appUrl)}/field-trips/${escapeHtml(trip.id)}/edit" style="display:inline-block;padding:10px 20px;background-color:#E65100;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:bold;">Edit &amp; Resubmit</a></p>` : ''}
    `,
  });
}

/**
 * Notify the Transportation Secretary group that a field trip requiring transportation has been submitted.
 */
export async function sendFieldTripTransportationNotice(
  emails: string[],
  trip: {
    id: string; destination: string; tripDate: Date | string;
    teacherName: string; schoolBuilding: string; gradeClass: string;
    studentCount: number; purpose: string; transportationDetails?: string | null;
    departureTime: string; returnTime: string;
  },
  submitterName: string,
): Promise<void> {
  if (emails.length === 0) return;

  const dateStr = new Date(trip.tripDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  await sendMail({
    to:      emails,
    subject: `Transportation Needed — Field Trip: ${trip.destination} on ${dateStr}`,
    html: `
      <h2 style="color:#E65100;">Field Trip Transportation Request</h2>
      <p>A field trip requiring transportation has been submitted by <strong>${escapeHtml(submitterName)}</strong>.</p>
      ${fieldTripDetailHtml(trip)}
      <table style="border-collapse:collapse;width:100%;margin-top:8px;">
        <tr><td style="padding:4px 8px;font-weight:bold;">Departure Time:</td>
            <td style="padding:4px 8px;">${escapeHtml(trip.departureTime)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Return Time:</td>
            <td style="padding:4px 8px;">${escapeHtml(trip.returnTime)}</td></tr>
        ${trip.transportationDetails ? `<tr><td style="padding:4px 8px;font-weight:bold;vertical-align:top;">Transportation Details:</td>
            <td style="padding:4px 8px;">${escapeHtml(trip.transportationDetails)}</td></tr>` : ''}
      </table>
      <p style="margin-top:24px;">Please log in to the system to view the full field trip details and coordinate transportation.</p>
    `,
  });
}

// ---------------------------------------------------------------------------
// Transportation Step 2 notification emails
// ---------------------------------------------------------------------------

/**
 * Notify the Transportation Director group that a Step 2 transportation form has been submitted.
 */
export async function sendTransportationStep2SubmittedNotice(
  emails: string[],
  trip: {
    id: string; destination: string; tripDate: Date | string;
    teacherName: string; schoolBuilding: string; gradeClass: string;
    studentCount: number; purpose: string;
    departureTime: string; returnTime: string;
  },
  transportRequest: {
    busCount: number; chaperoneCount: number; loadingLocation: string; loadingTime: string;
  },
  submitterName: string,
): Promise<void> {
  if (emails.length === 0) return;

  const dateStr = new Date(trip.tripDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  await sendMail({
    to:      emails,
    subject: `Transportation Form Ready for Review — ${escapeHtml(trip.destination)} on ${dateStr}`,
    html: `
      <h2 style="color:#1565C0;">Step 2 Transportation Form Ready for Review</h2>
      <p><strong>${escapeHtml(submitterName)}</strong> has submitted the transportation form for a field trip
         requiring your review and approval (Part C).</p>
      ${fieldTripDetailHtml(trip)}
      <table style="border-collapse:collapse;width:100%;margin-top:8px;">
        <tr><td style="padding:4px 8px;font-weight:bold;">Buses Requested:</td>
            <td style="padding:4px 8px;">${transportRequest.busCount}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Chaperones:</td>
            <td style="padding:4px 8px;">${transportRequest.chaperoneCount}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Loading Location:</td>
            <td style="padding:4px 8px;">${escapeHtml(transportRequest.loadingLocation)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Loading Time:</td>
            <td style="padding:4px 8px;">${escapeHtml(transportRequest.loadingTime)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Trip Departure:</td>
            <td style="padding:4px 8px;">${escapeHtml(trip.departureTime)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Trip Return:</td>
            <td style="padding:4px 8px;">${escapeHtml(trip.returnTime)}</td></tr>
      </table>
      <p style="margin-top:24px;">Please log in to the system to review and approve or deny this transportation request.</p>
    `,
  });
}

/**
 * Notify the submitter that their transportation request has been approved.
 */
export async function sendTransportationApproved(
  submitterEmail: string,
  trip: {
    id: string; destination: string; tripDate: Date | string;
    teacherName: string; schoolBuilding: string; gradeClass: string;
    studentCount: number; purpose: string;
  },
  transportRequest: {
    transportationType:     string | null;
    transportationCost:     unknown;
    transportationBusCount: number | null;
    driverNames:            string[] | null;
    transportationNotes:    string | null;
  },
): Promise<void> {
  const typeLabels: Record<string, string> = {
    DISTRICT_BUS:     'District Bus',
    CHARTER:          'Charter Bus',
    PARENT_TRANSPORT: 'Parent/Staff Transport',
    WALKING:          'Walking',
  };
  const typeLabel = transportRequest.transportationType
    ? (typeLabels[transportRequest.transportationType] ?? transportRequest.transportationType)
    : 'Not specified';

  const costStr = transportRequest.transportationCost != null
    ? `$${Number(transportRequest.transportationCost).toFixed(2)}`
    : 'TBD';

  const driversHtml = (() => {
    if (!transportRequest.driverNames?.length) return '';
    return transportRequest.driverNames
      .map(
        (name, i) =>
          `<tr><td style="padding:4px 8px;font-weight:bold;">Bus ${i + 1} Driver:</td>` +
          `<td style="padding:4px 8px;">${escapeHtml(name || '\u2014')}</td></tr>`,
      )
      .join('');
  })();

  await sendMail({
    to:      submitterEmail,
    subject: `Transportation Approved — Field Trip: ${trip.destination}`,
    html: `
      <h2 style="color:#2E7D32;">Your Transportation Request Has Been Approved</h2>
      <p>The Transportation Director has approved the transportation for your field trip.</p>
      ${fieldTripDetailHtml(trip)}
      <table style="border-collapse:collapse;width:100%;margin-top:8px;">
        <tr><td style="padding:4px 8px;font-weight:bold;">Transportation Type:</td>
            <td style="padding:4px 8px;">${escapeHtml(typeLabel)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Assessed Cost:</td>
            <td style="padding:4px 8px;">${escapeHtml(costStr)}</td></tr>
        ${transportRequest.transportationBusCount != null ? `<tr><td style="padding:4px 8px;font-weight:bold;">Number of Buses:</td><td style="padding:4px 8px;">${transportRequest.transportationBusCount}</td></tr>` : ''}
        ${driversHtml}
        ${transportRequest.transportationNotes ? `<tr><td style="padding:4px 8px;font-weight:bold;vertical-align:top;">Notes:</td>
            <td style="padding:4px 8px;">${escapeHtml(transportRequest.transportationNotes)}</td></tr>` : ''}
      </table>
      <p style="margin-top:24px;">Please ensure all school policies and procedures are followed when conducting the field trip.</p>
    `,
  });
}

/**
 * Notify the submitter that their transportation request has been denied.
 */
export async function sendTransportationDenied(
  submitterEmail: string,
  trip: {
    id: string; destination: string; tripDate: Date | string;
    teacherName: string; schoolBuilding: string; gradeClass: string;
    studentCount: number; purpose: string;
  },
  transportRequest: { transportationNotes: string | null },
  reason: string,
): Promise<void> {
  await sendMail({
    to:      submitterEmail,
    subject: `Transportation Denied — Field Trip: ${trip.destination}`,
    html: `
      <h2 style="color:#C62828;">Your Transportation Request Has Been Denied</h2>
      <p>The Transportation Director has denied the transportation request for your field trip.</p>
      ${fieldTripDetailHtml(trip)}
      <p style="margin-top:16px;"><strong>Reason for denial:</strong></p>
      <blockquote style="border-left:4px solid #C62828;margin:8px 0;padding:8px 16px;background:#FFEBEE;">
        ${escapeHtml(reason)}
      </blockquote>
      ${transportRequest.transportationNotes ? `<p><strong>Additional notes:</strong> ${escapeHtml(transportRequest.transportationNotes)}</p>` : ''}
      <p style="margin-top:16px;">If you have questions, please contact the Transportation Director.</p>
    `,
  });
}

// ---------------------------------------------------------------------------
// Standalone Transportation Request notification emails
// ---------------------------------------------------------------------------

/**
 * Notify the Transportation Secretary group that a new standalone
 * transportation request has been submitted and needs review.
 */
export async function sendTransportationRequestSubmitted(
  emails: string[],
  request: {
    id:                     string;
    school:                 string;
    groupOrActivity:        string;
    sponsorName:            string;
    tripDate:               Date | string;
    primaryDestinationName: string;
    busCount:               number;
    studentCount:           number;
  },
  submitterName: string,
): Promise<void> {
  if (emails.length === 0) return;

  const dateStr = new Date(request.tripDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  await sendMail({
    to:      emails,
    subject: `Transportation Request Submitted: ${request.groupOrActivity} — ${dateStr}`,
    html: `
      <h2 style="color:#E65100;">New Transportation Request Awaiting Review</h2>
      <p><strong>${escapeHtml(submitterName)}</strong> has submitted a transportation request that needs your review.</p>
      <table style="border-collapse:collapse;width:100%;margin-top:16px;">
        <tr><td style="padding:4px 8px;font-weight:bold;">School:</td>
            <td style="padding:4px 8px;">${escapeHtml(request.school)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Group / Activity:</td>
            <td style="padding:4px 8px;">${escapeHtml(request.groupOrActivity)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Sponsor:</td>
            <td style="padding:4px 8px;">${escapeHtml(request.sponsorName)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Trip Date:</td>
            <td style="padding:4px 8px;">${dateStr}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Destination:</td>
            <td style="padding:4px 8px;">${escapeHtml(request.primaryDestinationName)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Buses Requested:</td>
            <td style="padding:4px 8px;">${request.busCount}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Students:</td>
            <td style="padding:4px 8px;">${request.studentCount}</td></tr>
      </table>
      <p style="margin-top:24px;">
        <a href="${escapeHtml(process.env.APP_URL ?? '')}/transportation-requests/${escapeHtml(request.id)}"
           style="display:inline-block;padding:10px 20px;background-color:#E65100;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:bold;">
          Review Request
        </a>
      </p>
    `,
  });
}

/**
 * Notify the submitter their standalone transportation request was approved.
 */
export async function sendTransportationRequestApproved(
  submitterEmail: string,
  request: {
    id:                     string;
    school:                 string;
    groupOrActivity:        string;
    tripDate:               Date | string;
    primaryDestinationName: string;
    approvalComments?:      string | null;
  },
): Promise<void> {
  const dateStr = new Date(request.tripDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  await sendMail({
    to:      submitterEmail,
    subject: `Transportation Request Approved: ${request.groupOrActivity} — ${dateStr}`,
    html: `
      <h2 style="color:#2E7D32;">Your Transportation Request Has Been Approved</h2>
      <p>Your transportation request for <strong>${escapeHtml(request.groupOrActivity)}</strong> on ${dateStr} has been approved by the Transportation Secretary.</p>
      <table style="border-collapse:collapse;width:100%;margin-top:16px;">
        <tr><td style="padding:4px 8px;font-weight:bold;">School:</td>
            <td style="padding:4px 8px;">${escapeHtml(request.school)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Destination:</td>
            <td style="padding:4px 8px;">${escapeHtml(request.primaryDestinationName)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Trip Date:</td>
            <td style="padding:4px 8px;">${dateStr}</td></tr>
      </table>
      ${request.approvalComments ? `
      <p style="margin-top:16px;"><strong>Notes from Transportation Secretary:</strong></p>
      <blockquote style="border-left:4px solid #2E7D32;margin:8px 0;padding:8px 16px;background:#E8F5E9;">
        ${escapeHtml(request.approvalComments)}
      </blockquote>` : ''}
      <p style="margin-top:24px;">Please ensure all transportation arrangements are confirmed before the trip date.</p>
    `,
  });
}

/**
 * Notify the submitter their standalone transportation request was denied.
 */
export async function sendTransportationRequestDenied(
  submitterEmail: string,
  request: {
    id:                     string;
    school:                 string;
    groupOrActivity:        string;
    tripDate:               Date | string;
    primaryDestinationName: string;
  },
  denialReason: string,
): Promise<void> {
  const dateStr = new Date(request.tripDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  await sendMail({
    to:      submitterEmail,
    subject: `Transportation Request Denied: ${request.groupOrActivity} — ${dateStr}`,
    html: `
      <h2 style="color:#C62828;">Your Transportation Request Has Been Denied</h2>
      <p>We regret to inform you that your transportation request for <strong>${escapeHtml(request.groupOrActivity)}</strong> has been denied.</p>
      <table style="border-collapse:collapse;width:100%;margin-top:16px;">
        <tr><td style="padding:4px 8px;font-weight:bold;">School:</td>
            <td style="padding:4px 8px;">${escapeHtml(request.school)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Destination:</td>
            <td style="padding:4px 8px;">${escapeHtml(request.primaryDestinationName)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Trip Date:</td>
            <td style="padding:4px 8px;">${dateStr}</td></tr>
      </table>
      <p style="margin-top:16px;"><strong>Reason for denial:</strong></p>
      <blockquote style="border-left:4px solid #C62828;margin:8px 0;padding:8px 16px;background:#FFEBEE;">
        ${escapeHtml(denialReason)}
      </blockquote>
      <p style="margin-top:16px;">If you believe this decision was made in error, please contact the Transportation department directly.</p>
    `,
  });
}
