import { z } from "zod";
import { metadata } from "./configuration";
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
export const sessionRange = z
  .object({
    from: z.iso.date().or(z.literal("")),
    to: z.iso.date().or(z.literal("")),
  })
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    "The end date must be on or after the start date.",
  );
