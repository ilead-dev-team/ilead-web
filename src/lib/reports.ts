import { z } from "zod";
import { metadata } from "./configuration";
const text = z.object({ text: z.string().max(20000) });
const bullets = z.object({
  items: z
    .array(
      z.object({
        lead: z.string().max(200).optional(),
        text: z.string().max(4000),
      }),
    )
    .max(100),
});
const table = z
  .object({
    columns: z.array(z.string().max(200)).min(1).max(8),
    rows: z.array(z.array(z.string().max(4000)).max(8)).max(500),
  })
  .refine(
    (value) => value.rows.every((row) => row.length === value.columns.length),
    "Every row must match the column count.",
  );
const fields = {
  id: z.uuid(),
  key: z.string().nullable(),
  title: z.string().trim().min(1).max(120),
  isMandatory: z.boolean(),
  autoSource: z.enum(["NONE", "PROGRESS", "ACTIVITIES"]),
  position: z.number().int().positive(),
};
export const reportSection = z.discriminatedUnion("kind", [
  z.object({ ...fields, kind: z.literal("TEXT"), content: text }),
  z.object({ ...fields, kind: z.literal("BULLETS"), content: bullets }),
  z.object({ ...fields, kind: z.literal("TABLE"), content: table }),
]);
export const reportSummary = z.object({
  id: z.uuid(),
  status: z.enum(["DRAFT", "FINAL", "SENT", "CHANGES_REQUESTED"]),
  version: z.number().int().positive(),
  author: z.object({ id: z.uuid(), name: z.string() }),
  session: z.object({ id: z.uuid(), date: z.iso.date() }),
  academicYearId: z.uuid(),
  academicYear: z.string(),
  term: z.object({ id: z.uuid(), name: z.string() }),
  openChangeRequests: z.number().int().nonnegative(),
  archivedAt: z.iso.datetime().nullable(),
  sentAt: z.iso.datetime().nullable(),
  firstReadAt: z.iso.datetime().nullable(),
});
export const reportRecord = reportSummary.extend({
  sections: z.array(reportSection).min(2).max(30),
});
export type Report = z.infer<typeof reportRecord>;
export type ReportSection = z.infer<typeof reportSection>;
export function canReportAction(
  report: Report,
  actor: { id: string; role: string },
  action: string,
) {
  if (actor.role !== "COORDINATOR" || report.archivedAt) return false;
  if (action === "takeover")
    return report.status === "DRAFT" && report.author.id !== actor.id;
  if (report.author.id !== actor.id) return false;
  if (["confirm", "progress", "highlights"].includes(action))
    return report.status === "DRAFT";
  if (action === "reopen") return report.status !== "DRAFT";
  return action === "send" && report.status === "FINAL";
}
export function parseReport(value: unknown, role: string) {
  const report = reportRecord.parse(value);
  if (
    role === "SPONSOR" &&
    !["SENT", "CHANGES_REQUESTED"].includes(report.status)
  )
    throw new Error("Unpublished report unavailable");
  return report;
}
export function parseReportPage(value: unknown, role: string) {
  const result = z
    .object({ data: z.array(reportSummary), meta: metadata })
    .parse(value);
  if (
    role === "SPONSOR" &&
    result.data.some(
      (report) => !["SENT", "CHANGES_REQUESTED"].includes(report.status),
    )
  )
    throw new Error("Unpublished reports unavailable");
  return result;
}
export function sectionPayload(sections: ReportSection[]) {
  if (
    sections.length < 2 ||
    sections.length > 30 ||
    sections[0]?.key !== "summary" ||
    !sections.some(
      (section) => section.key === "progress" && section.isMandatory,
    )
  )
    throw new Error(
      "Keep the mandatory summary first and retain the progress section.",
    );
  return {
    sections: sections.map((section) => {
      const parsed = reportSection.parse({
        ...section,
        id: section.id.startsWith("new-")
          ? "00000000-0000-4000-8000-000000000000"
          : section.id,
      });
      const { title, kind, content } = parsed;
      return {
        ...(section.id.startsWith("new-") ? {} : { id: section.id }),
        title,
        kind,
        content,
      };
    }),
  };
}
export const reportLabels = {
  DRAFT: "Draft",
  FINAL: "Final",
  SENT: "Sent",
  CHANGES_REQUESTED: "Changes requested",
};
