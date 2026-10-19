import { z } from "zod";
import {
  section,
  sectionTitle,
  sectionKind,
  type Section,
} from "./configuration";
import type { ReportSection } from "./reports";
export const librarySection = section.extend({
  id: z.uuid(),
  key: z.string().min(1).max(100),
  title: sectionTitle,
});
export function newReportSection(
  title: string,
  kind: string,
  position: number,
  template?: Section,
): ReportSection {
  const base = {
    id: `new-${crypto.randomUUID()}`,
    key: template?.key ?? null,
    title: sectionTitle.parse(title),
    isMandatory: false,
    autoSource: template?.autoSource ?? ("NONE" as const),
    position,
  };
  if (
    template &&
    (template.isArchived ||
      template.isMandatory ||
      template.autoSource === "PROGRESS")
  )
    throw new Error("Section unavailable");
  switch (sectionKind.parse(kind)) {
    case "TEXT":
      return { ...base, kind: "TEXT", content: { text: "" } };
    case "BULLETS":
      return { ...base, kind: "BULLETS", content: { items: [] } };
    case "TABLE":
      return {
        ...base,
        kind: "TABLE",
        content: { columns: ["Column"], rows: [] },
      };
  }
}
export function parseCreatedTemplate(
  value: unknown,
  title: string,
  kind: string,
) {
  const parsed = librarySection.parse(value);
  if (
    parsed.title !== title ||
    parsed.kind !== kind ||
    parsed.isSystem ||
    parsed.isMandatory ||
    parsed.isPreselected ||
    parsed.isArchived ||
    parsed.autoSource !== "NONE"
  )
    throw new Error("Unexpected library acknowledgement");
  return parsed;
}
