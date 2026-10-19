import { test } from "node:test";
import assert from "node:assert/strict";
import {
  draftFrom,
  entryPayload,
  needsConfirmation,
  entryAcknowledgement,
  type EntryRow,
} from "../src/lib/entries.js";
import { createApiClient, ApiError } from "../src/lib/api.js";
const row: EntryRow = {
  roundtable: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Summits",
    currentLevel: "ICHOOSE",
    classYear: "YEAR_1",
  },
  entry: null,
  suggested: {
    level: "ICHOOSE",
    lessonId: "22222222-2222-4222-8222-222222222222",
    number: 1,
    title: "Leadership",
  },
};
test("Did not meet never sends lesson fields and drafts use server suggestions", () => {
  const draft = draftFrom(row, true);
  assert.equal(needsConfirmation(draft), false);
  assert.deepEqual(entryPayload([{ ...draft, met: false }]), {
    entries: [{ roundtableId: row.roundtable.id, met: false }],
  });
  assert.throws(() => entryPayload([{ ...draft, lessonId: "" }]));
  assert.throws(() => entryPayload(Array.from({ length: 101 }, () => draft)));
});
test("non-next and cross-level changes require explicit confirmation; identical saved lessons do not", () => {
  const draft = {
    ...draftFrom(row, true),
    level: "IDO" as const,
    lessonId: "33333333-3333-4333-8333-333333333333",
  };
  assert.equal(needsConfirmation(draft), true);
  assert.equal(entryPayload([draft]).entries[0]?.met, true);
  assert.deepEqual(entryPayload([draft], [row.roundtable.id]).entries[0], {
    roundtableId: row.roundtable.id,
    met: true,
    level: "IDO",
    lessonId: draft.lessonId,
    confirmNotNext: true,
  });
  assert.equal(
    needsConfirmation({
      ...draft,
      row: {
        ...row,
        entry: { met: true, level: draft.level, lessonId: draft.lessonId },
      },
    }),
    false,
  );
});
test("acknowledgements reject errors and malformed saved counts", () => {
  assert.equal(
    entryAcknowledgement.safeParse({
      data: {
        saved: 1,
        warnings: [],
        errors: [{ roundtableId: row.roundtable.id, code: "INVALID_LESSON" }],
      },
    }).success,
    false,
  );
  assert.equal(
    entryAcknowledgement.safeParse({
      data: { saved: -1, warnings: [], errors: [] },
    }).success,
    false,
  );
});
test("API errors retain structured entry details without retrying validation failures", async () => {
  let calls = 0;
  const details = {
    saved: 0,
    warnings: [],
    errors: [
      { roundtableId: row.roundtable.id, code: "LESSON_ALREADY_COMPLETED" },
    ],
  };
  const client = createApiClient(async () => {
    calls++;
    return new Response(
      JSON.stringify({
        error: {
          code: "ENTRY_VALIDATION_FAILED",
          message: "No entries were saved.",
          requestId: "request",
          details,
        },
      }),
      { status: 422 },
    );
  });
  await assert.rejects(
    client("/sessions/id/entries", { method: "PUT", body: {} }),
    (error) =>
      error instanceof ApiError &&
      error.requestId === "request" &&
      JSON.stringify(error.details) === JSON.stringify(details),
  );
  assert.equal(calls, 1);
});
