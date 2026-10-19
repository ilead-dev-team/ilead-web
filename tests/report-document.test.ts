import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatReportDate,
  documentState,
  documentSections,
} from "../src/lib/report-document.js";
import type { ReportSection } from "../src/lib/reports.js";
test("document dates use Kigali and correct ordinal suffixes", () => {
  for (const [day, suffix] of [
    [1, "st"],
    [2, "nd"],
    [3, "rd"],
    [11, "th"],
    [12, "th"],
    [13, "th"],
    [21, "st"],
    [22, "nd"],
    [23, "rd"],
    [31, "st"],
  ] as const)
    assert.match(
      formatReportDate(`2026-10-${String(day).padStart(2, "0")}`),
      new RegExp(`${day}${suffix} October 2026`),
    );
  assert.throws(() => formatReportDate("2026-02-30"));
  assert.throws(() => formatReportDate("invalid"));
});
test("document states never describe unsent content as sent", () => {
  assert.equal(
    documentState({ status: "DRAFT", version: 2 }),
    "Draft preview · Not sent",
  );
  assert.equal(
    documentState({ status: "FINAL", version: 2 }),
    "Final preview · Not sent",
  );
  assert.equal(
    documentState({ status: "CHANGES_REQUESTED", version: 2 }),
    "Sent version 2",
  );
});
test("saved document order follows positions, working order follows live edits, invalid progress is refused", () => {
  const section = {
    id: "one",
    key: null,
    title: "Text",
    kind: "TEXT",
    isMandatory: false,
    autoSource: "NONE",
    position: 2,
    content: { text: "" },
  } as ReportSection;
  const sections = [section, { ...section, id: "two", position: 1 }];
  assert.deepEqual(
    documentSections(sections).map((s) => s.id),
    ["two", "one"],
  );
  assert.equal(documentSections(sections, true), sections);
  assert.throws(() => documentSections([{ ...section, key: "progress" }]));
});
