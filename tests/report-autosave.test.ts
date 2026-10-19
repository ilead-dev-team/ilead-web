import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rebaseReportDraft,
  validateSaveAcknowledgement,
} from "../src/lib/report-autosave.js";
import { newReportSection } from "../src/lib/report-library.js";
import type { Report, ReportSection } from "../src/lib/reports.js";
const id = "11111111-1111-4111-8111-111111111111",
  progressId = "22222222-2222-4222-8222-222222222222",
  newId = "33333333-3333-4333-8333-333333333333";
const sections: ReportSection[] = [
  {
    ...newReportSection("Summary", "TEXT", 1),
    id,
    key: "summary",
    isMandatory: true,
  },
  {
    ...newReportSection("Progress", "TABLE", 2),
    id: progressId,
    key: "progress",
    isMandatory: true,
    autoSource: "PROGRESS",
  },
];
const report: Report = {
  id,
  status: "DRAFT",
  version: 1,
  author: { id, name: "Author" },
  session: { id, date: "2026-10-14" },
  academicYearId: id,
  academicYear: "2026",
  term: { id, name: "Term" },
  openChangeRequests: 0,
  archivedAt: null,
  sentAt: null,
  firstReadAt: null,
  sections,
};
test("save acknowledgement rejects mismatched identity, ownership, state and section content", () => {
  assert.equal(validateSaveAcknowledgement(sections, report, id, id), report);
  for (const patch of [
    { id: progressId },
    { status: "FINAL" as const },
    { author: { id: progressId, name: "Other" } },
    { archivedAt: "2026-10-19T10:00:00Z" },
    { sections: sections.slice(1) },
    { sections: [sections[0]!, sections[0]!] },
    {
      sections: [
        {
          ...sections[0]!,
          kind: "TEXT" as const,
          content: { text: "not submitted" },
        },
        sections[1]!,
      ],
    },
  ])
    assert.throws(() =>
      validateSaveAcknowledgement(sections, { ...report, ...patch }, id, id),
    );
});
test("a late response assigns new section IDs while preserving newer text and structure", () => {
  const local = newReportSection("Notes", "TEXT", 3);
  const sent = [...sections, local];
  const saved = [...sections, { ...local, id: newId }];
  validateSaveAcknowledgement(sent, { ...report, sections: saved }, id, id);
  const newer = [
    ...sections,
    { ...local, content: { text: "Typed while saving" } },
  ] as ReportSection[];
  const rebased = rebaseReportDraft(sent, saved, newer);
  assert.equal(rebased[2]!.id, newId);
  assert.deepEqual(rebased[2]!.content, { text: "Typed while saving" });
  assert.equal(local.id.startsWith("new-"), true);
  assert.deepEqual(rebaseReportDraft(sent, saved, sections), sections);
});
test("saved template identity cannot silently change in an acknowledgement", () => {
  const local = {
    ...newReportSection("Notes", "TEXT", 3),
    key: "custom_notes",
  };
  const sent = [...sections, local];
  assert.throws(() =>
    validateSaveAcknowledgement(
      sent,
      {
        ...report,
        sections: [...sections, { ...local, id: newId, key: null }],
      },
      id,
      id,
    ),
  );
});
