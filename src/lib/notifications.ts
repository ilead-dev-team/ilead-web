import { z } from "zod";
import { ApiError } from "./api";
import type { User } from "./account";
import { metadata } from "./configuration";
export const noticeTypes = [
  "ACCOUNT_RECOVERY_REQUESTED",
  "REPORT_SENT",
  "REPORT_COMMENT",
  "REPORT_CHANGE_REQUESTED",
  "REPORT_RESUBMITTED",
  "REPORT_READ",
  "REPORT_TAKEN_OVER",
  "ROUNDTABLE_REGISTERED",
  "PROGRESS_UPDATED",
  "ROUNDTABLE_STALE",
  "ISSUE_RAISED",
  "ISSUE_RESOLVED",
  "SESSION_CONFIRM_REMINDER",
  "REPORT_DUE_REMINDER",
  "REGISTER_ROUNDTABLE_REMINDER",
] as const;
export const reminderKinds = {
  SESSION_CONFIRM_REMINDER: "SESSION_CONFIRM",
  REPORT_DUE_REMINDER: "REPORT_DUE",
  REGISTER_ROUNDTABLE_REMINDER: "REGISTER_ROUNDTABLE",
} as const;
export const reminderLabels = {
  SESSION_CONFIRM: "Confirm a session",
  REPORT_DUE: "Prepare a session report",
  REGISTER_ROUNDTABLE: "Register your roundtable",
};
export const notice = z.strictObject({
  id: z.uuid(),
  type: z.enum(noticeTypes),
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  reminderId: z.uuid().nullable().optional().default(null),
});
export type Notice = z.infer<typeof notice>;
export const reminder = z.strictObject({
  id: z.uuid(),
  kind: z.enum(["SESSION_CONFIRM", "REPORT_DUE", "REGISTER_ROUNDTABLE"]),
  refType: z.string(),
  refId: z.string(),
  nextRunAt: z.iso.datetime(),
  snoozedUntil: z.iso.datetime().nullable(),
  lastSentAt: z.iso.datetime().nullable(),
  sendCount: z.number().int().nonnegative(),
  maxSends: z.number().int().nonnegative().nullable(),
  createdAt: z.iso.datetime(),
});
export type Reminder = z.infer<typeof reminder>;
export const snoozeDays = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type SnoozeDays = z.infer<typeof snoozeDays>;
export const countResponse = z.object({
  data: z.strictObject({
    count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
});
export const readAllResponse = z.object({
  data: z.strictObject({
    updated: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
});
const sponsored = new Set([
  "REPORT_SENT",
  "REPORT_RESUBMITTED",
  "REPORT_COMMENT",
]);
export function reminderKind(type: Notice["type"]) {
  return reminderKinds[type as keyof typeof reminderKinds] ?? null;
}
export function parseNotice(value: unknown, role: User["role"]) {
  const result = notice.parse(value);
  if (
    (role === "SPONSOR" && !sponsored.has(result.type)) ||
    (result.reminderId && (!reminderKind(result.type) || role === "SPONSOR"))
  )
    throw new Error("Unexpected notification audience");
  return result;
}
function checkPage(
  data: { id: string }[],
  meta: z.infer<typeof metadata>,
  page: number,
  pageSize: number,
) {
  if (
    meta.page !== page ||
    meta.pageSize !== pageSize ||
    meta.totalPages !== Math.ceil(meta.total / pageSize) ||
    data.length > pageSize ||
    new Set(data.map((row) => row.id)).size !== data.length
  )
    throw new Error("Unexpected notification page");
}
export function parseNotifications(
  value: unknown,
  role: User["role"],
  page: number,
  pageSize: 10 | 20,
  unread = false,
) {
  const parsed = z
    .object({ data: z.array(z.unknown()).max(pageSize), meta: metadata })
    .parse(value);
  const data = parsed.data.map((row) => parseNotice(row, role));
  checkPage(data, parsed.meta, page, pageSize);
  if (unread && data.some((row) => row.readAt !== null))
    throw new Error("Unexpected read notification in unread view");
  return { ...parsed, data };
}
export function parseReminder(value: unknown, role: User["role"]) {
  const result = reminder.parse(value);
  if (
    role === "SPONSOR" ||
    (role === "FACILITATOR" && result.kind !== "REGISTER_ROUNDTABLE") ||
    (role === "COORDINATOR" && result.kind === "REGISTER_ROUNDTABLE")
  )
    throw new Error("Unexpected reminder audience");
  return result;
}
export function parseReminders(
  value: unknown,
  role: User["role"],
  page: number,
) {
  const parsed = z
    .object({ data: z.array(z.unknown()).max(20), meta: metadata })
    .parse(value);
  const data = parsed.data.map((row) => parseReminder(row, role));
  checkPage(data, parsed.meta, page, 20);
  return { ...parsed, data };
}
export function readAcknowledgement(
  value: unknown,
  original: Notice,
  role: User["role"],
) {
  const result = parseNotice(value, role);
  if (
    result.id !== original.id ||
    result.type !== original.type ||
    result.createdAt !== original.createdAt ||
    !result.readAt
  )
    throw new ApiError(
      0,
      "READ_UNCONFIRMED",
      "The read result could not be verified. Refresh notifications before retrying.",
    );
  return result;
}
export function snoozeAcknowledgement(
  value: unknown,
  id: string,
  kind: Reminder["kind"],
  role: User["role"],
) {
  const result = parseReminder(value, role);
  if (result.id !== id || result.kind !== kind || !result.snoozedUntil)
    throw new ApiError(
      0,
      "SNOOZE_UNCONFIRMED",
      "The snooze result could not be verified. Refresh reminders before retrying.",
    );
  return result;
}
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const reportTarget = new RegExp(`^/reports/${uuid}(?:#comments)?$`),
  roundtableTarget = new RegExp(`^/roundtables/${uuid}(?:#issues)?$`),
  sessionTarget = new RegExp(`^/sessions/${uuid}$`),
  recoveryTarget = new RegExp(`^/people/recovery(?:\\?request=${uuid})?$`);
/** Exact route patterns prevent external URLs, encoded slashes and arbitrary queries. */
export function notificationTarget(
  link: string | null,
  user: User,
): string | null {
  if (!link) return null;
  const staff = user.role !== "FACILITATOR";
  if (
    staff &&
    (reportTarget.test(link) ||
      roundtableTarget.test(link) ||
      ["/dashboard", "/reports", "/roundtables", "/curriculum"].includes(link))
  )
    return link;
  if (user.role === "COORDINATOR") {
    if (
      sessionTarget.test(link) ||
      recoveryTarget.test(link) ||
      link === "/dashboard?stale=1"
    )
      return link;
    const date = /^\/sessions\/new\?date=(\d{4}-\d{2}-\d{2})$/.exec(link)?.[1];
    if (
      date &&
      z.iso.date().safeParse(date).success &&
      !date.startsWith("0000-")
    )
      return link;
  }
  if (
    user.role === "FACILITATOR" &&
    ["/my-roundtable", "/register-roundtable"].includes(link)
  )
    return user.hasRoundtable ? "/my-roundtable" : "/register-roundtable";
  if (
    link === "/issues" &&
    (user.role === "COORDINATOR" ||
      (user.role === "FACILITATOR" && user.hasRoundtable))
  )
    return link;
  return null;
}
export function reminderTarget(row: Reminder, user: User) {
  if (
    row.kind === "REGISTER_ROUNDTABLE" &&
    row.refType === "USER" &&
    row.refId === user.id &&
    user.role === "FACILITATOR"
  )
    return user.hasRoundtable ? "/my-roundtable" : "/register-roundtable";
  if (
    row.kind === "REPORT_DUE" &&
    row.refType === "SESSION" &&
    z.uuid().safeParse(row.refId).success &&
    user.role === "COORDINATOR"
  )
    return `/sessions/${row.refId}`;
  if (
    row.kind === "SESSION_CONFIRM" &&
    row.refType === "SESSION_DATE" &&
    user.role === "COORDINATOR"
  )
    return notificationTarget(`/sessions/new?date=${row.refId}`, user);
  return null;
}
export function reminderState(row: Reminder, checkedAt: number) {
  if (row.maxSends !== null && row.sendCount >= row.maxSends)
    return "Send limit reached";
  if (row.snoozedUntil && Date.parse(row.snoozedUntil) > checkedAt)
    return "Snoozed";
  return Date.parse(row.nextRunAt) <= checkedAt ? "Due" : "Scheduled";
}
export function notificationTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kigali",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
