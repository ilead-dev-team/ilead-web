import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseReport,
  canReportAction,
  parseReportPage,
  sectionPayload,
  reportSection,
  type ReportSection,
} from "../src/lib/reports.js";
import { reportPath, permittedNext, type User } from "../src/lib/account.js";
const id = "11111111-1111-4111-8111-111111111111",
  progressId = "22222222-2222-4222-8222-222222222222";
const summary: ReportSection = {
  id,
  key: "summary",
  title: "Opening summary",
  isMandatory: true,
  autoSource: "NONE",
  position: 1,
  kind: "TEXT",
  content: { text: "Saved summary" },
};
const progress: ReportSection = {
  id: progressId,
  key: "progress",
  title: "Progress report",
  isMandatory: true,
  autoSource: "PROGRESS",
  position: 2,
  kind: "TABLE",
  content: { columns: ["RoundTable", "Year", "Lesson", "Category"], rows: [] },
};
const report = {
  id,
  status: "DRAFT",
  version: 1,
  author: { id, name: "Author" },
  session: { id, date: "2026-10-14" },
  academicYearId: id,
  academicYear: "2026–27",
  term: { id, name: "Term 1" },
  openChangeRequests: 0,
  archivedAt: null,
  sentAt: null,
  firstReadAt: null,
  sections: [summary, progress],
};
test("Sponsor report parsing rejects live drafts/finals in both detail and list", () => {
  for (const status of ["DRAFT", "FINAL"]) {
    assert.throws(() => parseReport({ ...report, status }, "SPONSOR"));
    assert.throws(() =>
      parseReportPage(
        {
          data: [{ ...report, status }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
        "SPONSOR",
      ),
    );
  }
  assert.equal(
    parseReport({ ...report, status: "SENT" }, "SPONSOR").status,
    "SENT",
  );
});
test("section payloads retain existing IDs and omit client-controlled flags and new-section IDs", () => {
  const custom: ReportSection = {
    ...summary,
    id: "new-local",
    key: null,
    isMandatory: false,
    title: "Notes",
  };
  const result = sectionPayload([summary, progress, custom]);
  assert.deepEqual(result.sections[0], {
    id,
    title: summary.title,
    kind: "TEXT",
    content: summary.content,
  });
  assert.deepEqual(result.sections[2], {
    title: "Notes",
    kind: "TEXT",
    content: custom.content,
  });
  assert.throws(() => sectionPayload([progress, summary]));
  assert.throws(() => sectionPayload([summary]));
});
test("report sections reject mismatched tables and oversized narrative content", () => {
  assert.equal(
    reportSection.safeParse({
      ...progress,
      content: { columns: ["A", "B"], rows: [["only one"]] },
    }).success,
    false,
  );
  assert.equal(
    reportSection.safeParse({
      ...summary,
      content: { text: "x".repeat(20001) },
    }).success,
    false,
  );
});
test("report links and login returns are staff only", () => {
  const user: User = {
    id,
    name: "User",
    email: "user@example.test",
    role: "SPONSOR",
    classYear: null,
    hasRoundtable: true,
    roundtableId: id,
  };
  assert.equal(permittedNext(`/reports/${id}`, user), `/reports/${id}`);
  assert.equal(reportPath("/reports", "COORDINATOR"), true);
  assert.equal(reportPath(`/reports/${id}`, "FACILITATOR"), false);
  assert.equal(reportPath("/reports/arbitrary", "SPONSOR"), false);
});

test("report actions respect ownership, state and archive locks", () => {
  const current = parseReport(report, "COORDINATOR"),
    actor = { id, role: "COORDINATOR" };
  assert.equal(canReportAction(current, actor, "confirm"), true);
  assert.equal(canReportAction(current, actor, "send"), false);
  assert.equal(
    canReportAction({ ...current, status: "FINAL" }, actor, "send"),
    true,
  );
  assert.equal(
    canReportAction(
      current,
      { id: progressId, role: "COORDINATOR" },
      "takeover",
    ),
    true,
  );
  assert.equal(
    canReportAction(
      current,
      { id: progressId, role: "COORDINATOR" },
      "confirm",
    ),
    false,
  );
  assert.equal(
    canReportAction(current, { id, role: "SPONSOR" }, "confirm"),
    false,
  );
  assert.equal(
    canReportAction(
      { ...current, archivedAt: "2026-10-19T08:00:00.000Z" },
      actor,
      "confirm",
    ),
    false,
  );
});
