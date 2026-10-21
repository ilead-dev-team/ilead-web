import { z } from "zod";
import { api, ApiError } from "./api";
import { role } from "./account";
import { metadata } from "./configuration";
export async function verifyCoordinatorAccount(
  id: string,
  transport: typeof api = api,
) {
  const current = z
    .object({ data: z.object({ id: z.uuid(), role }) })
    .parse(await transport("/auth/me"));
  if (current.data.id !== id || current.data.role !== "COORDINATOR")
    throw new ApiError(
      409,
      "ACCOUNT_CHANGED",
      "Your sign-in changed. Reload this page before making account changes.",
    );
}

export const invitationSummary = z.strictObject({
  email: z.email(),
  role,
  expiresAt: z.iso.datetime(),
});
export const acceptedAccount = z.object({
  data: z.object({ user: z.object({ id: z.uuid(), email: z.email(), role }) }),
});
export function acceptance(
  value: unknown,
  expected: z.infer<typeof invitationSummary>,
) {
  const user = acceptedAccount.parse(value).data.user;
  if (
    user.email.toLowerCase() !== expected.email.toLowerCase() ||
    user.role !== expected.role
  )
    throw new Error("Unexpected invitation account");
  return user;
}
export const mailboxSummary = z
  .strictObject({
    connected: z.boolean(),
    provider: z.literal("gmail").nullable(),
    address: z.email().nullable(),
    reconnectRequired: z.boolean(),
  })
  .refine(
    (v) =>
      !v.connected ||
      (!!v.address && v.provider === "gmail" && !v.reconnectRequired),
    "Invalid connected mailbox",
  );
export function parseMailbox(value: unknown, requireConnected = false) {
  const parsed = z.object({ data: mailboxSummary }).safeParse(value);
  if (!parsed.success || (requireConnected && !parsed.data.data.connected))
    throw new ApiError(
      0,
      "UNCONFIRMED_MAILBOX",
      "Mailbox status could not be verified. Refresh the mailbox page before trying again.",
    );
  return parsed.data.data;
}
export function authorizationDestination(value: unknown) {
  const result = z
    .object({ data: z.object({ authorizationUrl: z.string().url() }) })
    .parse(value);
  const url = new URL(result.data.authorizationUrl);
  if (
    url.origin !== "https://accounts.google.com" ||
    url.pathname !== "/o/oauth2/v2/auth" ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new ApiError(
      0,
      "INVALID_AUTHORIZATION_URL",
      "The provider destination could not be verified. Start a new connection.",
    );
  return url.toString();
}
export function callbackInput(params: URLSearchParams) {
  for (const name of ["state", "code", "error"])
    if (params.getAll(name).length > 1)
      throw new Error("Repeated authorization parameter");
  const state = z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .parse(params.get("state"));
  if (params.has("code") === params.has("error"))
    throw new Error("Invalid authorization return");
  return params.has("error")
    ? { state, error: z.string().min(1).max(100).parse(params.get("error")) }
    : { state, code: z.string().min(1).max(4096).parse(params.get("code")) };
}
export const mailStatus = z.enum([
  "PENDING",
  "ACCEPTED",
  "FAILED",
  "CANCELLED",
]);
const recoveryRow = z.strictObject({
  id: z.uuid(),
  status: z.enum(["PENDING", "ISSUED", "RESOLVED"]),
  requestedAt: z.iso.datetime(),
  issuedAt: z.iso.datetime().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  user: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    role,
  }),
  deliveries: z
    .array(
      z.strictObject({
        id: z.uuid(),
        status: mailStatus,
        attempts: z.number().int().nonnegative(),
        acceptedAt: z.iso.datetime().nullable(),
        lastErrorCode: z.string().nullable(),
        expiresAt: z.iso.datetime(),
      }),
    )
    .max(1),
});
export type RecoveryRequest = z.infer<typeof recoveryRow>;
export function parseRecovery(value: unknown, page: number) {
  const result = z
    .object({ data: z.array(recoveryRow).max(20), meta: metadata })
    .parse(value);
  const { data, meta } = result;
  if (
    meta.page !== page ||
    meta.pageSize !== 20 ||
    meta.totalPages !== Math.ceil(meta.total / 20) ||
    new Set(data.map((row) => row.id)).size !== data.length ||
    data.length !== Math.max(0, Math.min(20, meta.total - (page - 1) * 20))
  )
    throw new Error("Unexpected recovery page");
  return result;
}
export const recoveryAcknowledgement = z.object({
  data: z.strictObject({ deliveryStatus: mailStatus }),
});
export function canSendRecovery(row: RecoveryRequest, now: number) {
  const latest = row.deliveries[0];
  return (
    row.status !== "RESOLVED" &&
    !(
      row.status === "ISSUED" &&
      latest &&
      ["PENDING", "ACCEPTED"].includes(latest.status) &&
      new Date(latest.expiresAt).getTime() > now
    )
  );
}
export function unconfirmedAccountWrite(error: unknown) {
  return (
    !(error instanceof ApiError) ||
    error.status === 0 ||
    error.status === 408 ||
    error.status >= 500
  );
}
export function recoveryDeliveryMessage(status: z.infer<typeof mailStatus>) {
  return {
    PENDING:
      "The reset email is queued. Refresh its delivery status before trying again.",
    ACCEPTED:
      "The email provider accepted the reset email. This does not confirm inbox delivery.",
    FAILED:
      "The reset email could not be sent. Check the connected mailbox before trying again.",
    CANCELLED:
      "The reset email was cancelled. Refresh the request and check the connected mailbox.",
  }[status];
}
