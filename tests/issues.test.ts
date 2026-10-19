import { test } from "node:test";
import assert from "node:assert/strict";
import { issueInput, issueSchema } from "../src/lib/issues.js";
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
