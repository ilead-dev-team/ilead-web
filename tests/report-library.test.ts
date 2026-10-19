import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newReportSection,
  parseCreatedTemplate,
} from "../src/lib/report-library.js";
import { sectionPayload, type ReportSection } from "../src/lib/reports.js";
const id = "11111111-1111-4111-8111-111111111111";
const template = {
  id,
  key: "custom_test",
  title: "Reflection",
  kind: "TEXT" as const,
  autoSource: "NONE" as const,
  isMandatory: false,
  isPreselected: false,
  isSystem: false,
  isArchived: false,
  position: 5,
};
test("library acknowledgement requires an available non-preselected custom structure matching the request", () => {
  assert.equal(
    parseCreatedTemplate(template, "Reflection", "TEXT").key,
    template.key,
  );
  for (const change of [
    { isMandatory: true },
    { isSystem: true },
    { isArchived: true },
    { isPreselected: true },
    { autoSource: "PROGRESS" },
    { kind: "TABLE" },
    { title: "Other" },
    { key: "" },
  ])
    assert.throws(() =>
      parseCreatedTemplate({ ...template, ...change }, "Reflection", "TEXT"),
    );
});
test("new library sections start empty and archived/mandatory templates are refused", () => {
  assert.deepEqual(
    newReportSection("Reflection", "TEXT", 3, template).content,
    { text: "" },
  );
  assert.deepEqual(newReportSection("List", "BULLETS", 3).content, {
    items: [],
  });
  assert.deepEqual(newReportSection("Table", "TABLE", 3).content, {
    columns: ["Column"],
    rows: [],
  });
  assert.throws(() =>
    newReportSection("Reflection", "TEXT", 3, {
      ...template,
      isArchived: true,
    }),
  );
  assert.throws(() =>
    newReportSection("Reflection", "TEXT", 3, {
      ...template,
      isMandatory: true,
    }),
  );
});
test("library insertion sends templateKey only while saved sections retain their ID", () => {
  const summary = {
    ...newReportSection("Opening summary", "TEXT", 1),
    id,
    key: "summary",
    isMandatory: true,
  } as ReportSection;
  const progress = {
    ...newReportSection("Progress", "TABLE", 2),
    id: "22222222-2222-4222-8222-222222222222",
    key: "progress",
    isMandatory: true,
  } as ReportSection;
  const added = newReportSection(template.title, template.kind, 3, template);
  const payload = sectionPayload([summary, progress, added]);
  assert.deepEqual(payload.sections[2], {
    templateKey: "custom_test",
    title: "Reflection",
    kind: "TEXT",
    content: { text: "" },
  });
  assert.equal("templateKey" in payload.sections[0]!, false);
  assert.equal("id" in payload.sections[2]!, false);
  assert.equal("key" in payload.sections[2]!, false);
  assert.equal("autoSource" in payload.sections[2]!, false);
});
