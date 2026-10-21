import { test } from "node:test";
import assert from "node:assert/strict";
import {
  roundtableEdit,
  progressResponse,
  savedRoundtable,
  restoredRoundtable,
  trashAcknowledgement,
  readRoundtableDetail,
  readRoundtablePage,
  uncertainRoundtableWrite,
} from "../src/lib/roundtables.js";
import { ApiError } from "../src/lib/api.js";
import { row, id, trashed, attendance, meta } from "./fixtures/roundtables.js";
import { roundtablePath } from "../src/lib/account.js";
test("roundtable save acknowledgement matches requested descriptive fields and live identity", () => {
  const input = roundtableEdit.parse(row);
  assert.equal(savedRoundtable({ data: row }, id, input).name, row.name);
  for (const change of [
    { name: "Lost name" },
    { slogan: "Lost slogan" },
    { classYear: "YEAR_3" },
    { id: "11111111-1111-4111-8111-111111111111" },
    { deletedAt: trashed.deletedAt },
  ])
    assert.throws(() =>
      savedRoundtable({ data: { ...row, ...change } }, id, input),
    );
});
test("restore requires live state and the original Facilitator while trash requires an empty acknowledgement", () => {
  assert.equal(restoredRoundtable({ data: row }, trashed).facilitator?.id, "f");
  for (const data of [
    trashed,
    { ...row, facilitator: null },
    { ...row, facilitator: { ...row.facilitator, id: "other" } },
    { ...row, purgeAfter: trashed.purgeAfter },
  ])
    assert.throws(() => restoredRoundtable({ data }, trashed));
  assert.doesNotThrow(() => trashAcknowledgement(undefined));
  for (const value of [null, {}, { data: row }])
    assert.throws(() => trashAcknowledgement(value));
});
test("roundtable detail reads reject different IDs, trash and changed own-record ownership", () => {
  const value = { data: { ...row, attendance } };
  assert.equal(readRoundtableDetail(value, id, "f").data.id, id);
  assert.throws(() =>
    readRoundtableDetail(value, "11111111-1111-4111-8111-111111111111"),
  );
  assert.throws(() => readRoundtableDetail(value, id, "other"));
  assert.throws(() =>
    readRoundtableDetail({ data: { ...trashed, attendance } }, id),
  );
});
test("roundtable pages enforce requested metadata, unique identities and live/trash state", () => {
  assert.equal(
    readRoundtablePage({ data: [row], meta }, 1, false).data.length,
    1,
  );
  assert.equal(
    readRoundtablePage({ data: [trashed], meta }, 1, true).data.length,
    1,
  );
  for (const value of [
    { data: [row], meta: { ...meta, page: 2 } },
    { data: [row, row], meta: { ...meta, total: 2 } },
    { data: [trashed], meta },
  ])
    assert.throws(() => readRoundtablePage(value, 1, false));
  for (const data of [
    row,
    { ...trashed, facilitator: row.facilitator },
    { ...trashed, purgeAfter: trashed.deletedAt },
  ])
    assert.throws(() => readRoundtablePage({ data: [data], meta }, 1, true));
});
test("uncertain roundtable writes need a read while known API rejections retain retryable input", () => {
  for (const error of [
    new Error(),
    new ApiError(0, "NETWORK", ""),
    new ApiError(408, "TIMEOUT", ""),
    new ApiError(503, "UNAVAILABLE", ""),
  ])
    assert.equal(uncertainRoundtableWrite(error), true);
  for (const status of [400, 401, 403, 409, 422, 429])
    assert.equal(
      uncertainRoundtableWrite(new ApiError(status, "REJECTED", "")),
      false,
    );
});
test("roundtable edits accept only descriptive fields and validate limits", () => {
  const valid = {
    name: "Summits",
    slogan: "Lead with care",
    classYear: "YEAR_2",
  };
  assert.deepEqual(
    roundtableEdit.parse({ ...valid, level: "ILEAD", lastCompletedLesson: 16 }),
    valid,
  );
  for (const name of ["ab", "!!!", "x".repeat(41)])
    assert.equal(roundtableEdit.safeParse({ ...valid, name }).success, false);
  assert.equal(
    roundtableEdit.safeParse({ ...valid, slogan: "ab" }).success,
    false,
  );
});
test("roundtable paths allow staff detail and restrict trash to Coordinators", () => {
  const path = "/roundtables/22222222-2222-4222-8222-222222222222";
  assert.equal(roundtablePath(path, "SPONSOR"), true);
  assert.equal(roundtablePath(path, "FACILITATOR"), false);
  assert.equal(roundtablePath("/roundtables/trash", "SPONSOR"), false);
  assert.equal(roundtablePath("/roundtables/trash", "COORDINATOR"), true);
  assert.equal(roundtablePath("/roundtables/arbitrary", "COORDINATOR"), false);
});
test("history rejects malformed dates and unknown completion sources", () => {
  assert.equal(
    progressResponse.safeParse({
      data: {
        completed: [
          {
            lessonId: "l",
            level: "ICHOOSE",
            number: 1,
            title: "Leadership",
            completedOn: "yesterday",
            sessionDate: null,
            source: "SESSION",
            recordedById: "u",
          },
        ],
      },
    }).success,
    false,
  );
});
