import { z } from "zod";
import type { User } from "./account";
import { ApiError } from "./api";
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const date = z.iso
  .date()
  .refine(
    (value) => !value.startsWith("0000-"),
    "Use a year greater than zero.",
  );
export const dashboardFilters = z
  .strictObject({
    academicYearId: z.uuid().optional(),
    termId: z.uuid().optional(),
    classYear: z.enum(["YEAR_1", "YEAR_2", "YEAR_3"]).optional(),
    level: z.enum(["ICHOOSE", "IDO", "ILEAD"]).optional(),
    roundtableId: z.uuid().optional(),
    from: date.optional(),
    to: date.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ["to"],
    message: "From date must be on or before to date.",
  });
export type DashboardFilters = z.infer<typeof dashboardFilters>;
export const emptyFilters = {
  academicYearId: "",
  termId: "",
  classYear: "",
  level: "",
  roundtableId: "",
  from: "",
  to: "",
};
export type FilterDraft = typeof emptyFilters;
export function parseFilters(draft: FilterDraft) {
  return dashboardFilters.parse(
    Object.fromEntries(
      Object.entries(draft).filter(([, value]) => value !== ""),
    ),
  );
}
export function filterQuery(filters: DashboardFilters) {
  return new URLSearchParams(
    Object.entries(dashboardFilters.parse(filters)).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  ).toString();
}
const commonCards = {
  activeRoundtables: count,
  completedRoundtables: count,
  unregisteredFacilitators: count,
  sessionsHeld: count,
  sessionsCancelled: count,
  staleRoundtables: count,
  reportsFlagged: count,
};
const item = <T extends z.ZodType>(key: T) =>
  z.strictObject({ key, label: z.string(), value: count });
const common = {
  academicYear: z.strictObject({ id: z.uuid(), label: z.string() }),
  stale: z
    .array(
      z.strictObject({
        roundtableId: z.uuid(),
        name: z.string(),
        lastProgressOn: date.nullable(),
      }),
    )
    .max(20),
  latestSessions: z
    .array(
      z.strictObject({
        id: z.uuid(),
        date,
        status: z.enum(["HELD", "CANCELLED"]),
      }),
    )
    .max(10),
};
const charts = {
  roundtablesByLevel: z.array(item(z.enum(["ICHOOSE", "IDO", "ILEAD"]))).max(3),
  roundtablesByClass: z
    .array(item(z.enum(["YEAR_1", "YEAR_2", "YEAR_3"])))
    .max(3),
  lastSessionAttendance: z
    .strictObject({ date, met: count, notMet: count, unrecorded: count })
    .nullable(),
};
const coordinator = z.strictObject({
  ...common,
  cards: z.strictObject({ ...commonCards, reportsAwaitingSend: count }),
  pies: z.strictObject({
    ...charts,
    reportsByStatus: z
      .array(item(z.enum(["DRAFT", "FINAL", "SENT", "CHANGES_REQUESTED"])))
      .max(4),
  }),
  unregisteredFacilitators: z
    .array(
      z.strictObject({
        id: z.uuid(),
        name: z.string(),
        classYear: z.enum(["YEAR_1", "YEAR_2", "YEAR_3"]).nullable(),
      }),
    )
    .max(20),
});
const sponsor = z.strictObject({
  ...common,
  cards: z.strictObject({ ...commonCards, reportsReceived: count }),
  pies: z.strictObject({
    ...charts,
    reportsByStatus: z
      .array(item(z.enum(["SENT", "CHANGES_REQUESTED"])))
      .max(2),
  }),
});
export type DashboardSummary =
  z.infer<typeof coordinator> | z.infer<typeof sponsor>;
export function parseSummary(
  value: unknown,
  role: User["role"],
  expectedYearId?: string,
): DashboardSummary {
  if (role === "FACILITATOR") throw new Error("Staff access required");
  const result = (role === "COORDINATOR" ? coordinator : sponsor).parse(value);
  if (expectedYearId && result.academicYear.id !== expectedYearId)
    throw new Error("Unexpected academic year in dashboard response");
  return result;
}
export const exportKinds = [
  "roundtables",
  "progress",
  "attendance",
  "reports",
] as const;
export type ExportKind = (typeof exportKinds)[number];
export const exportLabels: Record<ExportKind, string> = {
  roundtables: "Roundtables",
  progress: "Completed lessons",
  attendance: "Session attendance",
  reports: "Report list",
};
export function exportPath(kind: ExportKind, filters: DashboardFilters) {
  if (!exportKinds.includes(kind)) throw new Error("Unknown export");
  return `/exports/${kind}.xlsx?${filterQuery(filters)}`;
}
export const xlsxMime =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export async function validateXlsx(blob: Blob, type: string | null) {
  const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (
    type?.split(";")[0]?.trim().toLowerCase() !== xlsxMime ||
    blob.size < 4 ||
    blob.size > 20 * 1024 * 1024 ||
    bytes[0] !== 80 ||
    bytes[1] !== 75 ||
    bytes[2] !== 3 ||
    bytes[3] !== 4
  )
    throw new ApiError(
      0,
      "INVALID_EXPORT",
      "The server did not return a valid Excel file. Try again.",
    );
  return blob;
}
export const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  FINAL: "Confirmed",
  SENT: "Received",
  CHANGES_REQUESTED: "Changes requested",
};
export function chartGradient(values: number[]) {
  const max = Math.max(0, ...values);
  if (max === 0) return "var(--muted)";
  const scaled = values.map((value) => value / max),
    total = scaled.reduce((a, b) => a + b, 0);
  let position = 0;
  return `conic-gradient(${scaled
    .map((value, index) => {
      const start = position;
      position += (value / total) * 100;
      return `var(--chart-${index + 1}) ${start}% ${position}%`;
    })
    .join(", ")})`;
}
