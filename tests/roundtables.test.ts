import { test } from "node:test";
import assert from "node:assert/strict";
import { roundtableEdit, progressResponse } from "../src/lib/roundtables.js";
import { roundtablePath } from "../src/lib/account.js";
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
