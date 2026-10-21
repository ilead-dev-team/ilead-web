import { z } from "zod";
import { classYear } from "./account";
import { levelKey } from "./curriculum";
import { metadata } from "./configuration";
export const entryRow = z.object({
  roundtable: z.object({
    id: z.uuid(),
    name: z.string(),
    classYear,
    currentLevel: levelKey,
  }),
  entry: z
    .object({
      met: z.boolean(),
      level: levelKey.nullable(),
      lessonId: z.uuid().nullable(),
    })
    .nullable(),
  suggested: z
    .object({
      level: levelKey,
      lessonId: z.uuid(),
      number: z.number().int().min(1).max(16),
      title: z.string(),
    })
    .nullable(),
});
export const entryPage = z.object({ data: z.array(entryRow), meta: metadata });
export function parseEntryPage(
  value: unknown,
  filters: {
    page: number;
    onlyPending: boolean;
    level: string;
    classYear: string;
  },
) {
  const result = entryPage.parse(value),
    { data, meta } = result;
  if (
    meta.page !== filters.page ||
    meta.pageSize !== 20 ||
    meta.totalPages !== Math.ceil(meta.total / 20) ||
    data.length !==
      Math.max(0, Math.min(20, meta.total - (filters.page - 1) * 20)) ||
    new Set(data.map((r) => r.roundtable.id)).size !== data.length ||
    data.some(
      (r) =>
        (filters.onlyPending && r.entry !== null) ||
        (filters.level && r.roundtable.currentLevel !== filters.level) ||
        (filters.classYear && r.roundtable.classYear !== filters.classYear) ||
        (r.entry &&
          (r.entry.met
            ? !r.entry.level || !r.entry.lessonId
            : r.entry.level !== null || r.entry.lessonId !== null)),
    )
  )
    throw new Error(
      "The entry page could not be verified. Retry entries and lessons.",
    );
  return result;
}
const notice = z.object({ roundtableId: z.uuid(), code: z.string() });
export const entryProblems = z.object({
  saved: z.literal(0),
  warnings: z.array(notice),
  errors: z.array(notice),
});
export const entryAcknowledgement = z.object({
  data: z.object({
    saved: z.number().int().min(0).max(100),
    warnings: z.array(notice),
    errors: z.array(notice).length(0),
  }),
});
export function parseEntryAcknowledgement(value: unknown, ids: string[]) {
  const result = entryAcknowledgement.parse(value);
  if (
    result.data.saved > ids.length ||
    result.data.warnings.some(
      (w) => w.code !== "LESSON_NOT_NEXT" || !ids.includes(w.roundtableId),
    ) ||
    new Set(result.data.warnings.map((w) => w.roundtableId)).size !==
      result.data.warnings.length
  )
    throw new Error(
      "The entry save result could not be verified. Your drafts are retained.",
    );
  // Identical backend retries legitimately save zero changed rows.
  return result;
}
export const entryInput = z.discriminatedUnion("met", [
  z.object({ roundtableId: z.uuid(), met: z.literal(false) }),
  z.object({
    roundtableId: z.uuid(),
    met: z.literal(true),
    level: levelKey,
    lessonId: z.uuid(),
    confirmNotNext: z.boolean(),
  }),
]);
export type EntryRow = z.infer<typeof entryRow>;
export type Draft = {
  row: EntryRow;
  met: boolean;
  level: z.infer<typeof levelKey>;
  lessonId: string;
};
export function draftFrom(row: EntryRow, met: boolean): Draft {
  return {
    row,
    met,
    level:
      row.entry?.level ?? row.suggested?.level ?? row.roundtable.currentLevel,
    lessonId: row.entry?.lessonId ?? row.suggested?.lessonId ?? "",
  };
}
export function needsConfirmation(draft: Draft) {
  if (
    !draft.met ||
    (draft.row.entry?.met &&
      draft.row.entry.lessonId === draft.lessonId &&
      draft.row.entry.level === draft.level)
  )
    return false;
  return (
    draft.lessonId !== draft.row.suggested?.lessonId ||
    draft.level !== draft.row.suggested?.level
  );
}
export function entryPayload(
  drafts: Draft[],
  confirmed: string[] = [],
  catalog?: { data: { levels: { key: string; lessons: { id: string }[] }[] } },
) {
  if (drafts.length < 1 || drafts.length > 100)
    throw new Error("Save between 1 and 100 changed rows at a time.");
  if (
    new Set(drafts.map((d) => d.row.roundtable.id)).size !== drafts.length ||
    drafts.some(
      (d) =>
        d.met &&
        catalog &&
        !catalog.data.levels
          .find((l) => l.key === d.level)
          ?.lessons.some((l) => l.id === d.lessonId),
    )
  )
    throw new Error(
      "Choose a lesson from the loaded curriculum for each unique roundtable.",
    );
  return {
    entries: drafts.map((draft) =>
      entryInput.parse(
        draft.met
          ? {
              roundtableId: draft.row.roundtable.id,
              met: true,
              level: draft.level,
              lessonId: draft.lessonId,
              confirmNotNext: confirmed.includes(draft.row.roundtable.id),
            }
          : { roundtableId: draft.row.roundtable.id, met: false },
      ),
    ),
  };
}
export const entryErrorText: Record<string, string> = {
  INVALID_LESSON: "Select a lesson from the chosen level.",
  LESSON_ALREADY_COMPLETED:
    "This lesson was already completed in another record. Choose a different lesson.",
  ROUNDTABLE_NOT_AVAILABLE:
    "This roundtable is no longer available for this session.",
  LESSON_NOT_NEXT: "The server requires confirmation for this non-next lesson.",
};
