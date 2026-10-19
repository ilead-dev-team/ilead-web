import { test } from "node:test";
import assert from "node:assert/strict";
import {
  configurationName,
  sectionTitle,
  position,
} from "../src/lib/configuration.js";
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
