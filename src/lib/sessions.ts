import { z } from "zod";
import { metadata } from "./configuration";
import { ApiError } from "./api";
export const sessionInput = z.object({
  date: z.iso.date("Choose a valid session date."),
  notes: z.string().trim().max(5000),
  activities: z
    .array(z.object({ activityTypeId: z.uuid(), held: z.boolean() }))
    .max(100),
});
export const cancellation = z
  .string()
  .trim()
  .min(1, "Enter a cancellation reason.")
  .max(1000);
const count = z.number().int().nonnegative();
export const sessionRecord = z.object({
  id: z.uuid(),
  date: z.iso.date(),
  status: z.enum(["HELD", "CANCELLED"]),
  cancellationReason: z.string().nullable(),
  notes: z.string().nullable(),
  academicYear: z.object({ id: z.string(), label: z.string() }),
  term: z.object({
    id: z.string(),
    number: z.number().int(),
    name: z.string(),
  }),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  activities: z.array(
    z.object({ activityTypeId: z.uuid(), name: z.string(), held: z.boolean() }),
  ),
  counts: z.object({
    roundtables: count,
    met: count,
    notMet: count,
    pending: count,
  }),
  report: z
    .object({
      id: z.string(),
      status: z.enum(["DRAFT", "FINAL", "SENT", "CHANGES_REQUESTED"]),
    })
    .nullable(),
});
export const sessionPage = z.object({
  data: z.array(sessionRecord),
  meta: metadata,
});
export type SessionRecord = z.infer<typeof sessionRecord>;
export type SessionInput = z.infer<typeof sessionInput>;
export function readSession(value: unknown, id?: string) {
  const result = sessionRecord.parse(
    z.object({ data: z.unknown() }).parse(value).data,
  );
  if (
    (id && result.id !== id) ||
    (result.status === "HELD"
      ? result.cancellationReason !== null
      : !result.cancellationReason?.trim()) ||
    new Set(result.activities.map((a) => a.activityTypeId)).size !==
      result.activities.length
  )
    throw new Error("Unexpected session response");
  return result;
}
export function savedSession(value: unknown, input: SessionInput, id?: string) {
  const result = readSession(value, id);
  if (
    result.status !== "HELD" ||
    result.cancellationReason !== null ||
    result.date !== input.date ||
    (result.notes ?? "") !== input.notes ||
    result.activities.length !== input.activities.length ||
    input.activities.some(
      (a) =>
        !result.activities.some(
          (b) => b.activityTypeId === a.activityTypeId && b.held === a.held,
        ),
    )
  )
    throw new Error(
      "The saved session could not be verified. Check saved state before trying again.",
    );
  return result;
}
export function changedSession(
  value: unknown,
  id: string,
  action: { reason: string } | { status: "HELD" },
) {
  const result = readSession(value, id);
  const cancelled = "reason" in action;
  if (
    result.status !== (cancelled ? "CANCELLED" : "HELD") ||
    result.cancellationReason !== (cancelled ? action.reason : null)
  )
    throw new Error(
      "The session status could not be verified. Check saved state before trying again.",
    );
  return result;
}
export function uncertainSessionWrite(error: unknown) {
  return (
    !(error instanceof ApiError) ||
    error.status === 0 ||
    error.status === 408 ||
    error.status >= 500
  );
}
export function sessionOnDate(value: unknown, date: string) {
  const page = sessionPage.parse(value);
  if (
    page.meta.page !== 1 ||
    page.meta.pageSize !== 20 ||
    page.meta.total !== page.data.length ||
    page.data.length > 1 ||
    page.meta.totalPages !== (page.data.length ? 1 : 0) ||
    page.data.some((s) => s.date !== date)
  )
    throw new Error("Could not verify sessions for this date");
  return page.data[0] ?? null;
}
export const sessionRange = z
  .object({
    from: z.iso.date().or(z.literal("")),
    to: z.iso.date().or(z.literal("")),
  })
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    "The end date must be on or after the start date.",
  );
