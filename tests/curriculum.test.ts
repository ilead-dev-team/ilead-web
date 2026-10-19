import { test } from "node:test";
import assert from "node:assert/strict";
import { lessonTitle } from "../src/lib/curriculum.js";
import { permittedNext, type User } from "../src/lib/account.js";
test("lesson titles reject blanks and oversized input and trim valid input", () => {
  assert.equal(lessonTitle.safeParse("  ").success, false);
  assert.equal(lessonTitle.safeParse("x".repeat(201)).success, false);
  assert.equal(lessonTitle.parse("  Leadership  "), "Leadership");
});
test("curriculum login returns are restricted to Coordinator and Sponsor", () => {
  const user: User = {
    id: "u",
    name: "Person",
    email: "p@example.test",
    role: "SPONSOR",
    classYear: null,
    hasRoundtable: true,
    roundtableId: "r",
  };
  assert.equal(permittedNext("/curriculum", user), "/curriculum");
  assert.equal(
    permittedNext("/curriculum", { ...user, role: "COORDINATOR" }),
    "/curriculum",
  );
  assert.equal(
    permittedNext("/curriculum", { ...user, role: "FACILITATOR" }),
    "/my-roundtable",
  );
});
