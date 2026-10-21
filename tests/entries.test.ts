import { test } from "node:test";
import assert from "node:assert/strict";
import {
  draftFrom,
  entryPayload,
  needsConfirmation,
  entryAcknowledgement,
  parseEntryPage,
  parseEntryAcknowledgement,
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
const filters = { page: 1, onlyPending: false, level: "", classYear: "" };
const meta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
test("entry pages reject mismatched pagination, missing/duplicate rows and contradictory attendance", () => {
  assert.equal(parseEntryPage({ data: [row], meta }, filters).data.length, 1);
  for (const value of [
    { data: [row], meta: { ...meta, page: 2 } },
    { data: [], meta },
    { data: [row, row], meta: { ...meta, total: 2 } },
    {
      data: [
        {
          ...row,
          entry: {
            met: false,
            level: "ICHOOSE",
            lessonId: row.suggested!.lessonId,
          },
        },
      ],
      meta,
    },
    {
      data: [{ ...row, entry: { met: true, level: null, lessonId: null } }],
      meta,
    },
  ])
    assert.throws(() => parseEntryPage(value, filters));
  assert.equal(
    parseEntryPage(
      { data: [], meta: { ...meta, page: 2 } },
      { ...filters, page: 2 },
    ).data.length,
    0,
  );
});
test("entry pages must match requested pending, class and level predicates", () => {
  for (const selection of [
    { ...filters, classYear: "YEAR_2" },
    { ...filters, level: "IDO" },
  ])
    assert.throws(() => parseEntryPage({ data: [row], meta }, selection));
  assert.throws(() =>
    parseEntryPage(
      {
        data: [{ ...row, entry: { met: false, level: null, lessonId: null } }],
        meta,
      },
      { ...filters, onlyPending: true },
    ),
  );
});
test("entry acknowledgements accept idempotent zero changes but refuse unrelated or repeated warnings", () => {
  const result = { data: { saved: 0, warnings: [], errors: [] } };
  assert.equal(
    parseEntryAcknowledgement(result, [row.roundtable.id]).data.saved,
    0,
  );
  const warning = { roundtableId: row.roundtable.id, code: "LESSON_NOT_NEXT" };
  assert.equal(
    parseEntryAcknowledgement(
      { data: { ...result.data, saved: 1, warnings: [warning] } },
      [row.roundtable.id],
    ).data.saved,
    1,
  );
  for (const data of [
    { ...result.data, saved: 2 },
    { ...result.data, warnings: [warning, warning] },
    { ...result.data, warnings: [{ ...warning, code: "UNRECOGNIZED" }] },
    {
      ...result.data,
      warnings: [{ ...warning, roundtableId: row.suggested!.lessonId }],
    },
  ])
    assert.throws(() =>
      parseEntryAcknowledgement({ data }, [row.roundtable.id]),
    );
});
test("entry payloads refuse duplicate roundtables and lessons outside the loaded level", () => {
  const draft = draftFrom(row, true);
  assert.throws(() => entryPayload([draft, draft]));
  assert.throws(() =>
    entryPayload([draft], [], {
      data: { levels: [{ key: "IDO", lessons: [{ id: draft.lessonId }] }] },
    }),
  );
  assert.equal(
    entryPayload([draft], [], {
      data: { levels: [{ key: "ICHOOSE", lessons: [{ id: draft.lessonId }] }] },
    }).entries.length,
    1,
  );
});
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
