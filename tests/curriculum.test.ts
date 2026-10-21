import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lessonTitle,
  readCurriculum,
  savedLesson,
  curriculumLesson,
  uncertainLessonWrite,
} from "../src/lib/curriculum.js";
import { curriculumFixture } from "./fixtures/curriculum.js";
import { ApiError } from "../src/lib/api.js";
import { permittedNext, type User } from "../src/lib/account.js";
test("lesson titles reject blanks and oversized input and trim valid input", () => {
  assert.equal(lessonTitle.safeParse("  ").success, false);
  assert.equal(lessonTitle.safeParse("x".repeat(201)).success, false);
  assert.equal(lessonTitle.parse("  Leadership  "), "Leadership");
});

test("curriculum editing rejects incomplete, duplicate or contradictory level/lesson catalogs", () => {
  assert.equal(readCurriculum(curriculumFixture()).data.levels.length, 3);
  const invalid = [
    (value: ReturnType<typeof curriculumFixture>) => {
      value.data.levels.pop();
    },
    (value: ReturnType<typeof curriculumFixture>) => {
      value.data.levels[0]!.lessons.pop();
    },
    (value: ReturnType<typeof curriculumFixture>) => {
      value.data.levels[0]!.lessons[1]!.id =
        value.data.levels[0]!.lessons[0]!.id;
    },
    (value: ReturnType<typeof curriculumFixture>) => {
      value.data.levels[1]!.lessons[0]!.id =
        value.data.levels[0]!.lessons[0]!.id;
    },
    (value: ReturnType<typeof curriculumFixture>) => {
      value.data.levels[0]!.lessons[1]!.number = 1;
    },
    (value: ReturnType<typeof curriculumFixture>) => {
      value.data.levels.reverse();
    },
  ];
  for (const corrupt of invalid) {
    const value = curriculumFixture();
    corrupt(value);
    assert.throws(() => readCurriculum(value));
  }
});
test("lesson save acknowledgement must match ID, number, level and submitted title", () => {
  const original = curriculumFixture().data.levels[0]!.lessons[0]!;
  const response = { ...original, level: "ICHOOSE", title: "New wording" };
  assert.equal(
    savedLesson({ data: response }, original, "ICHOOSE", "New wording").title,
    "New wording",
  );
  for (const data of [
    { ...response, id: "other" },
    { ...response, number: 2 },
    { ...response, level: "IDO" },
    { ...response, title: "Old wording" },
  ])
    assert.throws(() =>
      savedLesson({ data }, original, "ICHOOSE", "New wording"),
    );
});
test("read-only title checks require the requested lesson within its fixed level", () => {
  const value = readCurriculum(curriculumFixture()),
    original = value.data.levels[0]!.lessons[0]!;
  assert.equal(
    curriculumLesson(value, original, "ICHOOSE").title,
    original.title,
  );
  assert.throws(() => curriculumLesson(value, original, "IDO"));
  assert.throws(() =>
    curriculumLesson(value, { ...original, number: 2 }, "ICHOOSE"),
  );
  assert.throws(() =>
    curriculumLesson(value, { ...original, id: "missing" }, "ICHOOSE"),
  );
});
test("refreshes allow title changes but reject lesson identity replacement across a mounted editor", () => {
  const previous = readCurriculum(curriculumFixture());
  assert.equal(
    readCurriculum(curriculumFixture("Updated elsewhere"), previous).data
      .levels[0]!.lessons[0]!.title,
    "Updated elsewhere",
  );
  const changed = curriculumFixture();
  changed.data.levels[2]!.lessons[5]!.id = "replacement";
  assert.throws(() => readCurriculum(changed, previous));
});
test("uncertain lesson saves are separated from known server rejections", () => {
  for (const status of [0, 408, 500, 503])
    assert.equal(
      uncertainLessonWrite(new ApiError(status, "TEST", "Test")),
      true,
    );
  for (const status of [400, 403, 404, 409, 429])
    assert.equal(
      uncertainLessonWrite(new ApiError(status, "TEST", "Test")),
      false,
    );
  assert.equal(uncertainLessonWrite(new Error("Unrelated response")), true);
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
