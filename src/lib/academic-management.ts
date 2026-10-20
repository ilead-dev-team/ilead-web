import { z } from "zod";
import { ApiError } from "./api";
import { metadata } from "./configuration";
const date = z.iso
  .date()
  .refine((v) => !v.startsWith("0000-"), "Use a year greater than zero.");
const name = z.string().trim().min(1, "Enter a name.");
const term = z.strictObject({
  number: z.number().int().min(1).max(3),
  name,
  startsOn: date,
  endsOn: date,
});
export const calendarForm = z
  .strictObject({
    label: name,
    startsOn: date,
    endsOn: date,
    terms: z.array(term).length(3),
  })
  .superRefine((year, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (year.startsOn > year.endsOn)
      issue(["endsOn"], "The year must end on or after its start date.");
    const sorted = [...year.terms].sort((a, b) => a.number - b.number);
    if (sorted.some((t, i) => t.number !== i + 1))
      issue(["terms"], "Define terms 1, 2 and 3 exactly once.");
    for (const [index, t] of year.terms.entries()) {
      if (t.startsOn > t.endsOn)
        issue(
          ["terms", index, "endsOn"],
          "The term must end on or after its start date.",
        );
      if (t.startsOn < year.startsOn || t.endsOn > year.endsOn)
        issue(
          ["terms", index, "startsOn"],
          "Keep the term inside the academic year.",
        );
      const previous = sorted.find((p) => p.number === t.number - 1);
      if (previous && previous.endsOn >= t.startsOn)
        issue(
          ["terms", index, "startsOn"],
          "Terms must follow number order without overlapping, including their boundary dates.",
        );
    }
  });
export type CalendarInput = z.infer<typeof calendarForm>;
export const managedYear = z
  .strictObject({
    id: z.uuid(),
    label: z.string().min(1),
    startsOn: date,
    endsOn: date,
    isCurrent: z.boolean(),
    terms: z.array(term.extend({ id: z.uuid() })).length(3),
  })
  .superRefine((year, ctx) => {
    const checked = calendarForm.safeParse({
      label: year.label,
      startsOn: year.startsOn,
      endsOn: year.endsOn,
      terms: year.terms.map(({ id: _id, ...t }) => {
        void _id;
        return t;
      }),
    });
    if (!checked.success || new Set(year.terms.map((t) => t.id)).size !== 3)
      ctx.addIssue({ code: "custom", message: "Invalid saved calendar" });
  });
export type ManagedYear = z.infer<typeof managedYear>;
export type CalendarPatch = Partial<CalendarInput> & { makeCurrent?: boolean };
export function blankCalendar(): CalendarInput {
  return {
    label: "",
    startsOn: "",
    endsOn: "",
    terms: [1, 2, 3].map((number) => ({
      number,
      name: `Term ${number}`,
      startsOn: "",
      endsOn: "",
    })),
  };
}
export function calendarDraft(year: ManagedYear): CalendarInput {
  return {
    label: year.label,
    startsOn: year.startsOn,
    endsOn: year.endsOn,
    terms: [...year.terms]
      .sort((a, b) => a.number - b.number)
      .map(({ id: _id, ...t }) => {
        void _id;
        return t;
      }),
  };
}
function sameTerms(a: CalendarInput["terms"], b: CalendarInput["terms"]) {
  const left = [...a].sort((x, y) => x.number - y.number),
    right = [...b].sort((x, y) => x.number - y.number);
  return (
    left.length === right.length &&
    left.every((t, i) => {
      const other = right[i];
      return (
        other &&
        t.number === other.number &&
        t.name === other.name &&
        t.startsOn === other.startsOn &&
        t.endsOn === other.endsOn
      );
    })
  );
}
export function calendarPatch(
  original: ManagedYear,
  value: CalendarInput,
): CalendarPatch {
  const input = calendarForm.parse(value),
    before = calendarDraft(original),
    patch: CalendarPatch = {};
  if (input.label !== before.label) patch.label = input.label;
  if (input.startsOn !== before.startsOn) patch.startsOn = input.startsOn;
  if (input.endsOn !== before.endsOn) patch.endsOn = input.endsOn;
  if (!sameTerms(input.terms, before.terms)) patch.terms = input.terms;
  return patch;
}
export function rebaseCalendar(
  original: ManagedYear,
  draft: CalendarInput,
  latest: ManagedYear,
): CalendarInput {
  const before = calendarDraft(original),
    after = calendarDraft(latest);
  return {
    label: draft.label === before.label ? after.label : draft.label,
    startsOn:
      draft.startsOn === before.startsOn ? after.startsOn : draft.startsOn,
    endsOn: draft.endsOn === before.endsOn ? after.endsOn : draft.endsOn,
    terms: draft.terms.map((t) => {
      const old = before.terms.find((row) => row.number === t.number)!,
        fresh = after.terms.find((row) => row.number === t.number)!;
      return {
        number: t.number,
        name: t.name === old.name ? fresh.name : t.name,
        startsOn: t.startsOn === old.startsOn ? fresh.startsOn : t.startsOn,
        endsOn: t.endsOn === old.endsOn ? fresh.endsOn : t.endsOn,
      };
    }),
  };
}
export function parseManagedPage(value: unknown, page: number) {
  const result = z
    .object({ data: z.array(managedYear).max(20), meta: metadata })
    .parse(value);
  if (
    result.meta.page !== page ||
    result.meta.pageSize !== 20 ||
    result.meta.totalPages !== Math.ceil(result.meta.total / 20) ||
    new Set(result.data.map((y) => y.id)).size !== result.data.length ||
    result.data.filter((y) => y.isCurrent).length > 1
  )
    throw new Error("Unexpected academic-year page");
  return result;
}
export function calendarAcknowledgement(
  value: unknown,
  expected: CalendarPatch,
  original?: ManagedYear,
): ManagedYear {
  const result = managedYear.safeParse(value);
  const row = result.success ? result.data : null;
  if (
    !row ||
    (original &&
      (row.id !== original.id ||
        row.terms.some(
          (t) => t.id !== original.terms.find((o) => o.number === t.number)?.id,
        ))) ||
    (expected.label !== undefined && expected.label !== row.label) ||
    (expected.startsOn !== undefined && expected.startsOn !== row.startsOn) ||
    (expected.endsOn !== undefined && expected.endsOn !== row.endsOn) ||
    (expected.makeCurrent !== undefined &&
      expected.makeCurrent !== row.isCurrent) ||
    (expected.terms && !sameTerms(expected.terms, row.terms))
  )
    throw new ApiError(
      0,
      "CALENDAR_UNCONFIRMED",
      "The calendar result could not be verified. Refresh years and inspect the saved calendar before trying again.",
    );
  return row;
}
export function uncertainCalendar(error: unknown) {
  return (
    !(error instanceof ApiError) || error.status === 0 || error.status >= 500
  );
}
