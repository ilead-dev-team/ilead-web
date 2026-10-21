import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cancellation,
  sessionInput,
  sessionRange,
  savedSession,
  changedSession,
  sessionOnDate,
  uncertainSessionWrite,
} from "../src/lib/sessions.js";
import { sessionPath, permittedNext, type User } from "../src/lib/account.js";
import { ApiError } from "../src/lib/api.js";
import { record, input, id, activityId } from "./fixtures/sessions.js";
test("session saves require matching identity, date, notes, state and complete activities", () => {
  assert.equal(savedSession({ data: record }, input, id).id, id);
  for (const changed of [
    { id: activityId },
    { date: "2026-10-21" },
    { notes: "Lost notes" },
    { status: "CANCELLED" },
    { cancellationReason: "Unexpected" },
    { activities: [] },
    { activities: [{ ...record.activities[0], held: false }] },
    { activities: [record.activities[0], record.activities[0]] },
  ])
    assert.throws(() =>
      savedSession({ data: { ...record, ...changed } }, input, id),
    );
  assert.equal(
    savedSession(
      { data: { ...record, notes: null, activities: [] } },
      { ...input, notes: "", activities: [] },
    ).notes,
    null,
  );
});
test("session lifecycle acknowledgements require requested status and cancellation reason", () => {
  const cancelled = {
    ...record,
    status: "CANCELLED",
    cancellationReason: "Closure",
  };
  assert.equal(
    changedSession({ data: cancelled }, id, { reason: "Closure" }).status,
    "CANCELLED",
  );
  assert.equal(
    changedSession({ data: record }, id, { status: "HELD" }).status,
    "HELD",
  );
  assert.throws(() =>
    changedSession({ data: record }, id, { reason: "Closure" }),
  );
  assert.throws(() =>
    changedSession({ data: cancelled }, id, { status: "HELD" }),
  );
  assert.throws(() =>
    changedSession({ data: cancelled }, id, { reason: "Different" }),
  );
  assert.throws(() =>
    changedSession({ data: { ...record, cancellationReason: "Stale" } }, id, {
      status: "HELD",
    }),
  );
});
test("uncertain session writes require reconciliation while known rejections retain editable forms", () => {
  for (const error of [
    new Error(),
    new ApiError(0, "NETWORK", ""),
    new ApiError(408, "TIMEOUT", ""),
    new ApiError(503, "UNAVAILABLE", ""),
  ])
    assert.equal(uncertainSessionWrite(error), true);
  for (const status of [400, 401, 403, 409, 422, 429])
    assert.equal(
      uncertainSessionWrite(new ApiError(status, "REJECTED", "")),
      false,
    );
});
test("uncertain creation lookup accepts only the exact date and consistent zero-or-one pagination", () => {
  const meta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
  assert.equal(sessionOnDate({ data: [record], meta }, input.date)?.id, id);
  assert.equal(
    sessionOnDate(
      { data: [], meta: { ...meta, total: 0, totalPages: 0 } },
      input.date,
    ),
    null,
  );
  for (const value of [
    { data: [record], meta: { ...meta, total: 0 } },
    { data: [record, record], meta: { ...meta, total: 2 } },
    { data: [record], meta: { ...meta, page: 2 } },
    { data: [{ ...record, date: "2026-10-21" }], meta },
  ])
    assert.throws(() => sessionOnDate(value, input.date));
});
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
