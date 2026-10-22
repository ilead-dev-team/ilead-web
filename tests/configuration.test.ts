import { test } from "node:test";
import assert from "node:assert/strict";
import {
  configurationName,
  sectionTitle,
  position,
  savedConfiguration,
  sameConfigurationIdentity,
  readConfigurationPage,
  checkConfigurationRecords,
  uncertainConfigurationWrite,
} from "../src/lib/configuration.js";
import { ApiError } from "../src/lib/api.js";
import { permittedNext, type User } from "../src/lib/account.js";
test("configuration boundaries match backend limits", () => {
  assert.equal(configurationName.safeParse(" ").success, false);
  assert.equal(configurationName.safeParse("x".repeat(201)).success, false);
  assert.equal(sectionTitle.safeParse("x".repeat(121)).success, false);
  assert.equal(configurationName.parse(" Reflection "), "Reflection");
  for (const value of [-1, 1.5, 100001, NaN])
    assert.equal(position.safeParse(value).success, false);
  assert.equal(position.parse(0), 0);
});

const activity = { id: "a", name: "Reflection", position: 0, isActive: true };
const section = {
  id: "s",
  key: "summary",
  title: "Summary",
  kind: "TEXT" as const,
  autoSource: "NONE" as const,
  isMandatory: true,
  isPreselected: true,
  isSystem: true,
  isArchived: false,
  position: 0,
};
test("save acknowledgements must match submitted values and protected section identity", () => {
  const body = { name: "Discussion", position: 4, isActive: false };
  const saved = { ...activity, ...body };
  assert.deepEqual(
    savedConfiguration("activities", { data: saved }, body, activity),
    saved,
  );
  for (const changed of [
    { id: "wrong" },
    { name: "Old" },
    { position: 3 },
    { isActive: true },
  ])
    assert.throws(() =>
      savedConfiguration(
        "activities",
        { data: { ...saved, ...changed } },
        body,
        activity,
      ),
    );
  for (const changed of [
    { key: "other" },
    { kind: "TABLE" },
    { autoSource: "PROGRESS" },
    { isSystem: false },
    { isMandatory: false },
    { isPreselected: false },
    { position: 4 },
    { isArchived: true },
  ])
    assert.throws(() =>
      savedConfiguration(
        "sections",
        { data: { ...section, title: "Renamed", ...changed } },
        { title: "Renamed" },
        section,
      ),
    );
  assert.throws(() => sameConfigurationIdentity(activity, section));
});
test("new records cannot acknowledge a different title, kind or system defaults", () => {
  const custom = {
    ...section,
    key: "custom",
    id: "new",
    isSystem: false,
    isMandatory: false,
    isPreselected: false,
  };
  assert.deepEqual(
    savedConfiguration(
      "sections",
      { data: custom },
      { title: "Summary", kind: "TEXT" },
    ),
    custom,
  );
  for (const changed of [
    { title: "Different" },
    { kind: "BULLETS" },
    { isSystem: true },
    { isArchived: true },
    { isMandatory: true },
    { isPreselected: true },
    { autoSource: "PROGRESS" },
  ])
    assert.throws(() =>
      savedConfiguration(
        "sections",
        { data: { ...custom, ...changed } },
        { title: "Summary", kind: "TEXT" },
      ),
    );
  assert.throws(() =>
    savedConfiguration(
      "activities",
      { data: { ...activity, isActive: false } },
      { name: activity.name },
    ),
  );
});
test("transport, timeout, server and malformed acknowledgements are uncertain; rejected writes are retryable", () => {
  for (const error of [
    new Error("bad reply"),
    ...[0, 408, 500, 503].map(
      (status) => new ApiError(status, "FAILED", "failed"),
    ),
  ])
    assert.equal(uncertainConfigurationWrite(error), true);
  for (const status of [400, 401, 403, 404, 409, 422, 429])
    assert.equal(
      uncertainConfigurationWrite(new ApiError(status, "REJECTED", "rejected")),
      false,
    );
});
const page = (
  data: (typeof activity)[],
  index: number,
  total: number,
  pageSize = 100,
) => ({
  data,
  meta: {
    page: index,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  },
});
test("recovery reads unfiltered pages, including a record beyond the first page", async () => {
  const records = Array.from({ length: 101 }, (_, index) => ({
    ...activity,
    id: String(index),
    name: `Activity ${index}`,
  }));
  const paths: string[] = [];
  const result = await checkConfigurationRecords("activities", async (path) => {
    paths.push(path);
    const index = Number(
      new URL(path, "https://example.test").searchParams.get("page"),
    );
    return page(
      records.slice((index - 1) * 100, index * 100),
      index,
      records.length,
    );
  });
  assert.deepEqual(result, records);
  assert.deepEqual(paths, [
    "/activity-types?page=1&pageSize=100",
    "/activity-types?page=2&pageSize=100",
  ]);
});
test("partial, overlapping, changing, oversized and wrong-page recovery reads fail closed", async () => {
  const records = Array.from({ length: 100 }, (_, index) => ({
    ...activity,
    id: String(index),
  }));
  for (const second of [
    page([records[0]!], 2, 101),
    page([], 2, 101),
    page([{ ...activity, id: "last" }], 2, 102),
    page([{ ...activity, id: "last" }], 1, 101),
  ]) {
    let calls = 0;
    await assert.rejects(
      checkConfigurationRecords("activities", async () =>
        ++calls === 1 ? page(records, 1, 101) : second,
      ),
    );
  }
  await assert.rejects(
    checkConfigurationRecords("activities", async () => page(records, 1, 2001)),
  );
  assert.throws(() =>
    readConfigurationPage(
      "activities",
      page([activity, activity], 1, 2, 20),
      1,
    ),
  );
  assert.throws(() =>
    readConfigurationPage("activities", page([activity], 2, 1, 20), 1),
  );
});
test("settings return routes are Coordinator only", () => {
  const user: User = {
    id: "u",
    name: "User",
    email: "u@example.test",
    role: "COORDINATOR",
    classYear: null,
    hasRoundtable: true,
    roundtableId: "r",
  };
  for (const path of ["/settings/activities", "/settings/sections"]) {
    assert.equal(permittedNext(path, user), path);
    assert.equal(
      permittedNext(path, { ...user, role: "SPONSOR" }),
      "/dashboard",
    );
    assert.equal(
      permittedNext(path, { ...user, role: "FACILITATOR" }),
      "/my-roundtable",
    );
  }
});
