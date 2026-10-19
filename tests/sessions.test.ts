import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cancellation,
  sessionInput,
  sessionRange,
} from "../src/lib/sessions.js";
import { sessionPath, permittedNext, type User } from "../src/lib/account.js";
test("session dates, note limits and cancellation reasons are validated", () => {
  assert.equal(
    sessionInput.safeParse({ date: "2026-02-30", notes: "", activities: [] })
      .success,
    false,
  );
  assert.equal(
    sessionInput.safeParse({
      date: "2026-10-14",
      notes: "x".repeat(5001),
      activities: [],
    }).success,
    false,
  );
  assert.equal(
    sessionInput.safeParse({ date: "2026-10-14", notes: "", activities: [] })
      .success,
    true,
  );
  assert.equal(cancellation.safeParse(" ").success, false);
  assert.equal(cancellation.parse(" Closure "), "Closure");
  assert.equal(
    sessionRange.safeParse({ from: "2026-10-20", to: "2026-10-01" }).success,
    false,
  );
});
test("session routes accept only Coordinator destinations", () => {
  for (const path of [
    "/sessions",
    "/sessions/new",
    "/sessions/11111111-1111-4111-8111-111111111111",
  ]) {
    assert.equal(sessionPath(path, "COORDINATOR"), true);
    assert.equal(sessionPath(path, "SPONSOR"), false);
    assert.equal(sessionPath(path, "FACILITATOR"), false);
  }
  assert.equal(sessionPath("/sessions/arbitrary", "COORDINATOR"), false);
});

test("login preserves permitted session return URLs", () => {
  const user: User = {
    id: "c",
    name: "Coordinator",
    email: "c@example.test",
    role: "COORDINATOR",
    classYear: null,
    hasRoundtable: false,
    roundtableId: null,
  };
  assert.equal(permittedNext("/sessions/new", user), "/sessions/new");
  assert.equal(
    permittedNext("/sessions/new", { ...user, role: "SPONSOR" }),
    "/dashboard",
  );
});
