import type { Report, ReportSection } from "./reports";
export type DocumentReport = Pick<
  Report,
  "academicYear" | "term" | "session" | "status" | "version" | "sections"
>;
export function formatReportDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    throw new Error("Invalid report date");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kigali",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(parsed);
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === name)!.value;
  const day = Number(part("day"));
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ??
        "th");
  return `${part("weekday")}, ${day}${suffix} ${part("month")} ${part("year")}`;
}
export function documentState(
  report: Pick<DocumentReport, "status" | "version">,
) {
  return report.status === "DRAFT"
    ? "Draft preview · Not sent"
    : report.status === "FINAL"
      ? "Final preview · Not sent"
      : `Sent version ${report.version}`;
}
export function documentSections(sections: ReportSection[], working = false) {
  const columns = ["RoundTable", "Year", "Lesson", "Category"];
  if (
    sections.some(
      (s) =>
        s.key === "progress" &&
        (s.kind !== "TABLE" ||
          s.content.columns.length !== 4 ||
          s.content.columns.some((c, i) => c !== columns[i])),
    )
  )
    throw new Error(
      "The progress table does not match the approved document format.",
    );
  return working
    ? sections
    : [...sections].sort((a, b) => a.position - b.position);
}
