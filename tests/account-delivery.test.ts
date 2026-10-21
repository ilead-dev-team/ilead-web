import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "../src/lib/api.js";
import {
  acceptance,
  invitationSummary,
  parseMailbox,
  authorizationDestination,
  callbackInput,
  parseRecovery,
  parseRecoveryDetail,
  recoverySelection,
  canSendRecovery,
  recoveryAcknowledgement,
  recoveryDeliveryMessage,
  unconfirmedAccountWrite,
  verifyCoordinatorAccount,
} from "../src/lib/account-delivery.js";
import {
  invite,
  invitee,
  mailbox,
  recovery,
  delivery,
  meta,
} from "./fixtures/account-delivery.js";
test("recovery deep links reject malformed and repeated identifiers", () => {
  assert.equal(recoverySelection(undefined), undefined);
  assert.equal(recoverySelection(recovery.id), recovery.id);
  for (const value of ["", "../mailbox", [recovery.id, recovery.id]])
    assert.equal(recoverySelection(value), null);
});
test("recovery details require matching identity, mailbox state and unique delivery history", () => {
  const data = {
    ...recovery,
    mailboxConnected: true,
    deliveries: [delivery, { ...delivery, id: invitee.id, status: "FAILED" }],
  };
  assert.equal(parseRecoveryDetail({ data }, recovery.id).deliveries.length, 2);
  assert.throws(() => parseRecoveryDetail({ data }, invitee.id));
  assert.throws(() =>
    parseRecoveryDetail(
      { data: { ...data, mailboxConnected: undefined } },
      recovery.id,
    ),
  );
  assert.throws(() =>
    parseRecoveryDetail(
      { data: { ...data, deliveries: [delivery, delivery] } },
      recovery.id,
    ),
  );
  assert.throws(() => parseRecovery({ data: [data], meta }, 1));
});
test("account writes require the expected active Coordinator identity", async () => {
  const client = (async () => ({
    data: { id: invitee.id, role: "COORDINATOR" },
  })) as typeof api;
  await verifyCoordinatorAccount(invitee.id, client);
  await assert.rejects(
    verifyCoordinatorAccount(recovery.id, client),
    /sign-in changed/,
  );
  await assert.rejects(
    verifyCoordinatorAccount(invitee.id, (async () => ({
      data: { id: invitee.id, role: "SPONSOR" },
    })) as typeof api),
    /sign-in changed/,
  );
});
test("invitation acknowledgements require the invited email/role and valid expiry", () => {
  assert.equal(
    acceptance({ data: { user: invitee } }, invitationSummary.parse(invite)).id,
    invitee.id,
  );
  for (const value of [
    { ...invitee, email: "other@example.test" },
    { ...invitee, role: "COORDINATOR" },
    { ...invitee, id: "invalid" },
  ])
    assert.throws(() =>
      acceptance({ data: { user: value } }, invitationSummary.parse(invite)),
    );
  assert.equal(
    invitationSummary.safeParse({ ...invite, expiresAt: "invalid" }).success,
    false,
  );
});
test("mailbox state fails closed on malformed, secret-bearing or contradictory responses", () => {
  assert.deepEqual(parseMailbox({ data: mailbox }, true), mailbox);
  for (const data of [
    { ...mailbox, connected: "yes" },
    { ...mailbox, address: null },
    { ...mailbox, provider: null },
    { ...mailbox, reconnectRequired: true },
    { ...mailbox, refreshToken: "forbidden" },
  ])
    assert.throws(() => parseMailbox({ data }));
  assert.throws(() =>
    parseMailbox({ data: { ...mailbox, connected: false } }, true),
  );
});
test("authorization navigation permits only the configured Google OAuth path", () => {
  const safe = "https://accounts.google.com/o/oauth2/v2/auth?state=example";
  assert.equal(
    authorizationDestination({ data: { authorizationUrl: safe } }),
    safe,
  );
  for (const url of [
    "https://accounts.google.com.evil.test/o/oauth2/v2/auth",
    "https://accounts.google.com/other",
    "https://user@accounts.google.com/o/oauth2/v2/auth",
    "http://accounts.google.com/o/oauth2/v2/auth",
    "https://accounts.google.com/o/oauth2/v2/auth#fragment",
  ])
    assert.throws(() =>
      authorizationDestination({ data: { authorizationUrl: url } }),
    );
});
test("OAuth return parsing refuses missing, repeated and conflicting single-use parameters", () => {
  const state = "a".repeat(43);
  assert.deepEqual(
    callbackInput(
      new URLSearchParams({ state, code: "provider-code", scope: "email" }),
    ),
    { state, code: "provider-code" },
  );
  assert.deepEqual(
    callbackInput(new URLSearchParams({ state, error: "access_denied" })),
    { state, error: "access_denied" },
  );
  for (const query of [
    `state=${state}`,
    `state=${state}&code=x&error=denied`,
    `state=${state}&state=${state}&code=x`,
    `state=${state}&code=x&code=y`,
    `state=bad&code=x`,
  ])
    assert.throws(() => callbackInput(new URLSearchParams(query)));
});
test("recovery pages enforce bounded IDs, dates, enums, safe fields and requested paging", () => {
  assert.equal(
    parseRecovery({ data: [recovery], meta }, 1).data[0]?.id,
    recovery.id,
  );
  for (const value of [
    { data: [recovery, recovery], meta: { ...meta, total: 2 } },
    { data: [{ ...recovery, requestedAt: "bad" }], meta },
    {
      data: [
        { ...recovery, user: { ...recovery.user, passwordHash: "forbidden" } },
      ],
      meta,
    },
    { data: [recovery], meta: { ...meta, page: 2 } },
    { data: [recovery], meta: { ...meta, pageSize: 100 } },
    { data: [{ ...recovery, status: "UNKNOWN" }], meta },
  ])
    assert.throws(() => parseRecovery(value, 1));
});
test("resolved and live issued recoveries are disabled, expired/failed requests may be reviewed", () => {
  const now = Date.parse("2026-10-20T09:00:00Z");
  assert.equal(canSendRecovery(recovery, now), true);
  assert.equal(
    canSendRecovery({ ...recovery, status: "RESOLVED" }, now),
    false,
  );
  for (const status of ["PENDING", "ACCEPTED"] as const)
    assert.equal(
      canSendRecovery(
        {
          ...recovery,
          status: "ISSUED",
          deliveries: [{ ...delivery, status }],
        },
        now,
      ),
      false,
    );
  for (const status of ["FAILED", "CANCELLED"] as const)
    assert.equal(
      canSendRecovery(
        {
          ...recovery,
          status: "ISSUED",
          deliveries: [{ ...delivery, status }],
        },
        now,
      ),
      true,
    );
  assert.equal(
    canSendRecovery(
      {
        ...recovery,
        status: "ISSUED",
        deliveries: [{ ...delivery, expiresAt: "2026-10-20T08:30:00Z" }],
      },
      now,
    ),
    true,
  );
});
test("delivery acknowledgements distinguish acceptance from delivery, queued, failed and cancelled", () => {
  assert.equal(
    recoveryAcknowledgement.safeParse({ data: { deliveryStatus: "DELIVERED" } })
      .success,
    false,
  );
  assert.match(
    recoveryDeliveryMessage("ACCEPTED"),
    /does not confirm inbox delivery/,
  );
  assert.match(recoveryDeliveryMessage("PENDING"), /queued/);
  assert.match(recoveryDeliveryMessage("FAILED"), /could not be sent/);
  assert.match(recoveryDeliveryMessage("CANCELLED"), /cancelled/);
  for (const status of [0, 408, 500])
    assert.equal(
      unconfirmedAccountWrite(new ApiError(status, "TEST", "Test")),
      true,
    );
  assert.equal(
    unconfirmedAccountWrite(new ApiError(400, "TEST", "Test")),
    false,
  );
});
