import { z } from "zod";
import { classYear } from "./account";
import { levelKey } from "./curriculum";
import { ApiError } from "./api";
export const levelLabels = { ICHOOSE: "iChoose", IDO: "iDo", ILEAD: "iLead" };
export const roundtableEdit = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Use at least 3 characters.")
    .max(40)
    .refine(
      (value) => /[\p{L}\p{N}]/u.test(value),
      "Include letters or numbers.",
    ),
  slogan: z.string().trim().min(3, "Use at least 3 characters.").max(80),
  classYear,
});
const lesson = z.object({
  id: z.string(),
  number: z.number().int().min(1).max(16),
  title: z.string(),
});
export const roundtable = z.object({
  id: z.uuid(),
  name: z.string(),
  slogan: z.string(),
  classYear,
  currentLevel: levelKey,
  lastLesson: lesson.nullable(),
  nextLesson: lesson.extend({ level: levelKey }).nullable(),
  status: z.enum(["ACTIVE", "COMPLETED"]),
  completedAt: z.iso.datetime().nullable(),
  facilitator: z
    .object({
      id: z.string(),
      name: z.string(),
      classYear: classYear.nullable(),
    })
    .nullable(),
  enrolledAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable().optional(),
  purgeAfter: z.iso.datetime().nullable().optional(),
  formerFacilitatorId: z.string().nullable().optional(),
});
export const roundtablePage = z.object({
  data: z.array(roundtable),
  meta: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});
export const detailResponse = z.object({
  data: roundtable.extend({
    attendance: z.object({
      met: z.number().int().nonnegative(),
      didNotMeet: z.number().int().nonnegative(),
      history: z.array(
        z.object({
          entryId: z.string(),
          met: z.boolean(),
          sessionId: z.string(),
          sessionDate: z.iso.date().nullable(),
          status: z.enum(["HELD", "CANCELLED"]),
        }),
      ),
    }),
  }),
});
export const progressResponse = z.object({
  data: z.object({
    completed: z.array(
      z.object({
        lessonId: z.string(),
        level: levelKey,
        number: z.number().int().min(1).max(16),
        title: z.string(),
        completedOn: z.iso.date().nullable(),
        source: z.enum(["SESSION_ENTRY", "ENROLLMENT_BASELINE"]),
        sessionDate: z.iso.date().nullable(),
        recordedById: z.string(),
      }),
    ),
  }),
});
export type Roundtable = z.infer<typeof roundtable>;
export function savedRoundtable(
  value: unknown,
  id: string,
  input: z.infer<typeof roundtableEdit>,
) {
  const result = z.object({ data: roundtable }).parse(value).data;
  if (
    result.id !== id ||
    result.deletedAt ||
    result.purgeAfter ||
    result.name !== input.name ||
    result.slogan !== input.slogan ||
    result.classYear !== input.classYear
  )
    throw new Error("The saved details could not be verified");
  return result;
}
export function restoredRoundtable(value: unknown, original: Roundtable) {
  const result = z.object({ data: roundtable }).parse(value).data;
  if (
    result.id !== original.id ||
    result.deletedAt ||
    result.purgeAfter ||
    !result.facilitator ||
    (original.formerFacilitatorId &&
      result.facilitator.id !== original.formerFacilitatorId)
  )
    throw new Error("The restored roundtable could not be verified");
  return result;
}
export function trashAcknowledgement(value: unknown) {
  if (value !== undefined)
    throw new Error("The trash result could not be verified");
}
export function readRoundtableDetail(
  value: unknown,
  id: string,
  ownerId?: string,
) {
  const result = detailResponse.parse(value);
  if (
    result.data.id !== id ||
    result.data.deletedAt ||
    result.data.purgeAfter ||
    (ownerId && result.data.facilitator?.id !== ownerId)
  )
    throw new Error("The roundtable could not be verified");
  return result;
}
export function readRoundtablePage(
  value: unknown,
  page: number,
  trash: boolean,
) {
  const result = roundtablePage.parse(value),
    { data, meta } = result;
  if (
    meta.page !== page ||
    meta.pageSize !== 20 ||
    meta.totalPages !== Math.ceil(meta.total / 20) ||
    data.length > Math.max(0, Math.min(20, meta.total - (page - 1) * 20)) ||
    new Set(data.map((r) => r.id)).size !== data.length ||
    data.some((r) =>
      trash
        ? !r.deletedAt ||
          !r.purgeAfter ||
          r.facilitator !== null ||
          Date.parse(r.purgeAfter) <= Date.parse(r.deletedAt)
        : Boolean(r.deletedAt || r.purgeAfter),
    )
  )
    throw new Error("The roundtable list could not be verified");
  return result;
}
export function uncertainRoundtableWrite(error: unknown) {
  return (
    !(error instanceof ApiError) ||
    error.status === 0 ||
    error.status === 408 ||
    error.status >= 500
  );
}
