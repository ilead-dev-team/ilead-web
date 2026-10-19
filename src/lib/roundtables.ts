import { z } from "zod";
import { classYear } from "./account";
import { levelKey } from "./curriculum";
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
