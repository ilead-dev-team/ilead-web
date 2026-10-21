import { test } from "node:test";
import assert from "node:assert/strict";
import {
  issueInput,
  issueSchema,
  createdIssue,
  resolvedIssue,
  readIssuePage,
  uncertainIssueWrite,
} from "../src/lib/issues.js";
import { permittedNext, type User } from "../src/lib/account.js";
const user: User = {
  id: "u",
  name: "Person",
  email: "p@example.test",
  role: "FACILITATOR",
  classYear: "YEAR_1",
  hasRoundtable: true,
  roundtableId: "rt",
};
test("issue forms trim messages and reject empty, oversized and invalid categories", () => {
  assert.equal(
    issueInput.parse({ category: "OTHER", message: "  Help  " }).message,
    "Help",
  );
  for (const value of [
    { category: "OTHER", message: " " },
    { category: "OTHER", message: "a".repeat(5001) },
    { category: "fake", message: "Help" },
  ])
    assert.equal(issueInput.safeParse(value).success, false);
});
test("issue destinations permit registered Facilitators and Coordinators, preserving Sponsor/registration gates", () => {
  assert.equal(permittedNext("/issues", user), "/issues");
  assert.equal(
    permittedNext("/issues", { ...user, hasRoundtable: false }),
    "/register-roundtable",
  );
  assert.equal(
    permittedNext("/issues", { ...user, role: "SPONSOR" }),
    "/dashboard",
  );
  assert.equal(
    permittedNext("/issues", { ...user, role: "COORDINATOR" }),
    "/issues",
  );
});
test("issue responses reject malformed timestamps before rendering", () => {
  assert.equal(
    issueSchema.safeParse({
      id: "x",
      category: "OTHER",
      message: "Help",
      status: "OPEN",
      createdAt: "not-a-date",
      resolvedAt: null,
      resolutionNote: null,
      roundtable: { id: "r", name: "R" },
      raisedBy: { id: "u", name: "U" },
      resolvedBy: null,
    }).success,
    false,
  );
});

const record = {
  id: "i",
  category: "OTHER" as const,
  message: "Help",
  status: "OPEN" as const,
  createdAt: "2026-10-21T08:00:00.000Z",
  resolvedAt: null,
  resolutionNote: null,
  resolvedBy: null,
  roundtable: { id: "rt", name: "Roundtable" },
  raisedBy: { id: "u", name: "Person" },
};
const resolved = {
  ...record,
  status: "RESOLVED" as const,
  resolvedAt: record.createdAt,
  resolutionNote: "Existing note",
  resolvedBy: { id: "other", name: "Other Coordinator" },
};
test("creation acknowledgement matches the submitted content and current owner", () => {
  const input = { category: record.category, message: record.message };
  assert.equal(createdIssue({ data: record }, input, user).id, "i");
  for (const row of [
    { ...record, message: "Different" },
    { ...record, category: "WRONG_LEVEL" },
    { ...record, raisedBy: { id: "other", name: "Other" } },
    { ...record, roundtable: { id: "other", name: "Other" } },
    resolved,
  ])
    assert.throws(() => createdIssue({ data: row }, input, user));
});
test("resolution acknowledgement matches the original issue but accepts an existing resolution", () => {
  assert.equal(
    resolvedIssue({ data: resolved }, record).resolutionNote,
    "Existing note",
  );
  for (const row of [
    record,
    { ...resolved, id: "other" },
    { ...resolved, message: "Other" },
    { ...resolved, roundtable: { id: "other", name: "Other" } },
  ])
    assert.throws(() => resolvedIssue({ data: row }, record));
});
test("issue status and resolution fields must agree", () => {
  for (const row of [
    { ...record, resolutionNote: "Impossible" },
    { ...record, resolvedAt: record.createdAt },
    { ...resolved, resolvedBy: null },
    { ...resolved, resolvedAt: null },
  ])
    assert.equal(issueSchema.safeParse(row).success, false);
});
test("issue page validates paging, duplicates, status and Facilitator ownership", () => {
  const page = {
    data: [record],
    meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  };
  assert.equal(readIssuePage(page, 1, "OPEN", user).data.length, 1);
  for (const value of [
    { ...page, data: [record, record] },
    { ...page, meta: { ...page.meta, page: 2 } },
    { ...page, meta: { ...page.meta, totalPages: 2 } },
    { ...page, data: [resolved] },
    {
      ...page,
      data: [{ ...record, raisedBy: { id: "other", name: "Other" } }],
    },
  ])
    assert.throws(() => readIssuePage(value, 1, "OPEN", user));
  assert.throws(() => readIssuePage(page, 2, "", user));
});

test("unknown issue outcomes are distinguished from known API rejections", async () => {
  const { ApiError } = await import("../src/lib/api.js");
  for (const status of [0, 408, 500, 503])
    assert.equal(
      uncertainIssueWrite(new ApiError(status, "TEST", "Test")),
      true,
    );
  for (const status of [400, 401, 403, 404, 409, 429])
    assert.equal(
      uncertainIssueWrite(new ApiError(status, "TEST", "Test")),
      false,
    );
  assert.equal(
    uncertainIssueWrite(new Error("Malformed acknowledgement")),
    true,
  );
});
