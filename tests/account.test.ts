import { test } from "node:test";
import assert from "node:assert/strict";
import {
  destination,
  permittedNext,
  resetSchema,
  type User,
} from "../src/lib/account.js";
const user: User = {
  id: "u",
  name: "Person",
  email: "person@example.test",
  role: "COORDINATOR",
  classYear: "YEAR_1",
  hasRoundtable: false,
  roundtableId: null,
};
test("role destinations honor the Facilitator registration gate", () => {
  assert.equal(destination(user), "/dashboard");
  assert.equal(destination({ ...user, role: "SPONSOR" }), "/dashboard");
  assert.equal(
    destination({ ...user, role: "FACILITATOR" }),
    "/register-roundtable",
  );
  assert.equal(
    destination({ ...user, role: "FACILITATOR", hasRoundtable: true }),
    "/my-roundtable",
  );
});
test("login return destinations cannot escape the origin or role", () => {
  for (const next of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/login",
    "/mailbox/callback?code=secret",
    "/dashboard%2f%2fother",
    null,
  ])
    assert.equal(permittedNext(next, user), "/dashboard");
  assert.equal(permittedNext("/mailbox", user), "/mailbox");
  assert.equal(
    permittedNext("/people/recovery?request=123", user),
    "/people/recovery?request=123",
  );
  assert.equal(
    permittedNext("/mailbox", { ...user, role: "SPONSOR" }),
    "/dashboard",
  );
  assert.equal(
    permittedNext("/dashboard", { ...user, role: "FACILITATOR" }),
    "/register-roundtable",
  );
});
test("password form rejects mismatch, short passwords and missing letter/number", () => {
  for (const password of ["Short1", "abcdefgh", "12345678"])
    assert.equal(
      resetSchema.safeParse({ password, confirmation: password }).success,
      false,
    );
  assert.equal(
    resetSchema.safeParse({ password: "Password123", confirmation: "other" })
      .success,
    false,
  );
  assert.equal(
    resetSchema.safeParse({
      password: "Password123",
      confirmation: "Password123",
    }).success,
    true,
  );
});
