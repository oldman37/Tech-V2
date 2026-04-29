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

async function fetchGroupEmails(groupId: string): Promise<string[]> {
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
