import { z } from "zod";
import { ApiError } from "./api";
import { role, classYear } from "./account";
import { metadata } from "./configuration";
export const roleLabels = {
  FACILITATOR: "Facilitator",
  COORDINATOR: "Coordinator",
  SPONSOR: "Sponsor",
};
export const roleHelp = {
  FACILITATOR: "Registers and follows their own roundtable.",
  SPONSOR:
    "Views program statistics and received reports, and comments or requests changes.",
  COORDINATOR: "Manages program records, accounts, invitations and reports.",
};
export const invitationInput = z.strictObject({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email("Enter a valid email address.")),
  role,
});
export type InvitationInput = z.infer<typeof invitationInput>;
const person = z
  .strictObject({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    role,
    classYear: classYear.nullable(),
    status: z.enum(["ACTIVE", "DEACTIVATED"]),
    emailVerifiedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    hasRoundtable: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.role !== "FACILITATOR" || typeof value.hasRoundtable === "boolean",
    "Facilitator registration state is required",
  );
const invitationFields = {
  id: z.uuid(),
  email: z.email(),
  role,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  status: z.enum(["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"]),
  deliveryStatus: z.enum(["PENDING", "ACCEPTED", "FAILED", "CANCELLED"]),
  deliveryError: z.string().nullable(),
};
const validLifecycle = (row: {
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: string;
}) =>
  new Date(row.expiresAt) > new Date(row.createdAt) &&
  (row.acceptedAt
    ? row.status === "ACCEPTED"
    : row.revokedAt
      ? row.status === "REVOKED"
      : ["PENDING", "EXPIRED"].includes(row.status));
export const invitation = z
  .strictObject(invitationFields)
  .refine(validLifecycle, "Inconsistent invitation lifecycle");
export const invitationRow = z
  .strictObject({
    ...invitationFields,
    deliveryAttempts: z.number().int().nonnegative(),
    deliveryAcceptedAt: z.iso.datetime().nullable(),
  })
  .refine(validLifecycle, "Inconsistent invitation lifecycle");
export type Invitation = z.infer<typeof invitation>;
export type InvitationRow = z.infer<typeof invitationRow>;
export type Person = z.infer<typeof person>;
export type InvitationStatus = Invitation["status"];
const peoplePage = z.object({ data: z.array(person).max(20), meta: metadata });
const invitationPage = z.object({
  data: z.array(invitationRow).max(20),
  meta: metadata,
});
function checkPage(
  data: { id: string }[],
  meta: z.infer<typeof metadata>,
  page: number,
) {
  if (
    meta.page !== page ||
    meta.pageSize !== 20 ||
    meta.totalPages !== Math.ceil(meta.total / meta.pageSize) ||
    data.length > meta.pageSize ||
    new Set(data.map((row) => row.id)).size !== data.length
  )
    throw new Error("Unexpected page response");
}
export function parsePeople(value: unknown, page: number, view: string) {
  const result = peoplePage.parse(value);
  checkPage(result.data, result.meta, page);
  if (
    result.data.some((row) =>
      view === "UNREGISTERED"
        ? row.role !== "FACILITATOR" ||
          row.status !== "ACTIVE" ||
          !row.emailVerifiedAt ||
          row.hasRoundtable
        : row.role !== view,
    )
  )
    throw new Error("Unexpected people filter response");
  return result;
}
export function parseInvitations(
  value: unknown,
  page: number,
  status: InvitationStatus | "",
) {
  const result = invitationPage.parse(value);
  checkPage(result.data, result.meta, page);
  if (status && result.data.some((row) => row.status !== status))
    throw new Error("Unexpected invitation filter response");
  return result;
}
export function acknowledgeInvitation(
  value: unknown,
  input: InvitationInput,
  id?: string,
) {
  const result = invitation.parse(value);
  if (
    result.email !== input.email ||
    result.role !== input.role ||
    result.status !== "PENDING" ||
    (id && result.id !== id)
  )
    throw new ApiError(
      0,
      "UNCONFIRMED_INVITATION",
      "The invitation result could not be verified. Refresh invitations before trying again.",
    );
  return result;
}
export function canManageInvitation(row: Pick<Invitation, "status">) {
  return row.status === "PENDING" || row.status === "EXPIRED";
}
export function uncertainResult(error: unknown) {
  return (
    !(error instanceof ApiError) || error.status === 0 || error.status >= 500
  );
}
export function deliveryMessage(status: Invitation["deliveryStatus"]) {
  return {
    ACCEPTED:
      "The email provider accepted the invitation email. Inbox delivery is not confirmed.",
    PENDING:
      "The invitation email is queued. Refresh its status before deciding whether to resend.",
    FAILED:
      "The invitation is stored, but its email could not be sent. Check the connected mailbox, then resend the existing invitation.",
    CANCELLED:
      "This email attempt was cancelled. Check the invitation status before creating or resending a link.",
  }[status];
}
export function formatPeopleTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kigali",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
