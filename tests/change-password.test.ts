import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiClient, ApiError, api } from "../src/lib/api.js";
import {
  changePassword,
  passwordOutcomeUnknown,
} from "../src/lib/change-password.js";
import { changePasswordSchema } from "../src/lib/account.js";
const body = { currentPassword: "Original123", newPassword: "Replacement456" };
test("current-password 401 sends one mutation without refresh or replay", async () => {
  const calls: string[] = [];
  const client = createApiClient(async (input, init) => {
    calls.push(String(input));
    if (String(input).endsWith("/auth/me"))
      return Response.json({ data: { id: "u" } });
    assert.deepEqual(JSON.parse(String(init?.body)), body);
    return Response.json(
      {
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Current password is incorrect",
        },
      },
      { status: 401 },
    );
  });
  await assert.rejects(
    changePassword("u", body, client),
    (e: unknown) => e instanceof ApiError && e.code === "INVALID_CREDENTIALS",
  );
  assert.deepEqual(calls, ["/api/v1/auth/me", "/api/v1/auth/change-password"]);
});
test("changed account blocks the password mutation", async () => {
  const calls: string[] = [];
  const client = (async (path: string) => {
    calls.push(path);
    return { data: { id: "other" } };
  }) as typeof api;
  await assert.rejects(
    changePassword("u", body, client),
    /Your account changed/,
  );
  assert.deepEqual(calls, ["/auth/me"]);
});
test("204 confirms success; malformed acknowledgement leaves the result uncertain", async () => {
  for (const valid of [true, false]) {
    const client = (async (path: string) =>
      path === "/auth/me"
        ? { data: { id: "u" } }
        : valid
          ? undefined
          : { data: { ok: true } }) as typeof api;
    if (valid) await changePassword("u", body, client);
    else
      await assert.rejects(changePassword("u", body, client), (e: unknown) =>
        passwordOutcomeUnknown(e),
      );
  }
});
test("only known rejection statuses allow another save", () => {
  for (const status of [400, 401, 403, 409, 429])
    assert.equal(
      passwordOutcomeUnknown(new ApiError(status, "TEST", "Rejected")),
      false,
    );
  for (const status of [0, 408, 500, 502])
    assert.equal(
      passwordOutcomeUnknown(new ApiError(status, "TEST", "Unknown")),
      true,
    );
  assert.equal(passwordOutcomeUnknown(new Error("lost response")), true);
});
test("password validation rejects missing current, weak new and mismatched confirmation", () => {
  assert.equal(
    changePasswordSchema.safeParse({ ...body, confirmation: body.newPassword })
      .success,
    true,
  );
  for (const value of [
    { ...body, currentPassword: "", confirmation: body.newPassword },
    { ...body, newPassword: "weak", confirmation: "weak" },
    { ...body, confirmation: "different" },
  ])
    assert.equal(changePasswordSchema.safeParse(value).success, false);
});
