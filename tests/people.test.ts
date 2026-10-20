import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../src/lib/api.js";
import { permittedNext, type User } from "../src/lib/account.js";
import {
  acknowledgeInvitation,
  canManageInvitation,
  deliveryMessage,
  formatPeopleTime,
  invitationInput,
  parseInvitations,
  parsePeople,
  uncertainResult,
} from "../src/lib/people.js";
import { invitation, inviteAck, person, ids } from "./fixtures/people.js";
const meta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
test("invitations canonicalize email and accept only explicit supported roles", () => {
  assert.deepEqual(
    invitationInput.parse({ email: "  Person@Example.test ", role: "SPONSOR" }),
    { email: "person@example.test", role: "SPONSOR" },
  );
  for (const value of [
    { email: "bad", role: "FACILITATOR" },
    { email: "a@example.test", role: "ADMIN" },
    { email: "a@example.test", role: "SPONSOR", token: "raw" },
  ])
    assert.equal(invitationInput.safeParse(value).success, false);
});
test("people pages require safe fields, registration state and matching role/unregistered predicates", () => {
  assert.equal(
    parsePeople({ data: [person], meta }, 1, "FACILITATOR").data.length,
    1,
  );
  assert.equal(
    parsePeople({ data: [person], meta }, 1, "UNREGISTERED").data.length,
    1,
  );
  assert.throws(() => parsePeople({ data: [person], meta }, 1, "SPONSOR"));
  for (const changes of [
    { hasRoundtable: undefined },
    { hasRoundtable: true },
    { emailVerifiedAt: null },
    { status: "DEACTIVATED" },
  ])
    assert.throws(() =>
      parsePeople(
        { data: [{ ...person, ...changes }], meta },
        1,
        "UNREGISTERED",
      ),
    );
  assert.throws(() =>
    parsePeople(
      { data: [{ ...person, passwordHash: "private" }], meta },
      1,
      "FACILITATOR",
    ),
  );
});
test("list acknowledgements validate paging, unique IDs and requested invitation status", () => {
  assert.equal(
    parseInvitations({ data: [invitation], meta }, 1, "PENDING").data[0]!.id,
    ids.invitation,
  );
  assert.throws(() =>
    parseInvitations({ data: [invitation], meta }, 2, "PENDING"),
  );
  assert.throws(() =>
    parseInvitations({ data: [invitation], meta }, 1, "EXPIRED"),
  );
  assert.throws(() =>
    parseInvitations(
      { data: [invitation, invitation], meta: { ...meta, total: 2 } },
      1,
      "PENDING",
    ),
  );
  assert.throws(() =>
    parseInvitations(
      { data: [invitation], meta: { ...meta, pageSize: 100 } },
      1,
      "PENDING",
    ),
  );
  assert.throws(() =>
    parseInvitations(
      { data: [{ ...invitation, token: "secret" }], meta },
      1,
      "PENDING",
    ),
  );
});
test("creation/resend acknowledgement requires the original recipient, role, lifecycle and identity", () => {
  const input = { email: invitation.email, role: invitation.role };
  const ack = inviteAck(invitation);
  assert.equal(
    acknowledgeInvitation(ack, input, ids.invitation).id,
    ids.invitation,
  );
  for (const change of [
    { id: ids.other },
    { email: "other@example.test" },
    { role: "SPONSOR" },
    { status: "EXPIRED" },
    { createdAt: "bad" },
    { expiresAt: "2026-01-01T00:00:00Z" },
    { tokenHash: "secret" },
  ])
    assert.throws(() =>
      acknowledgeInvitation({ ...ack, ...change }, input, ids.invitation),
    );
  assert.throws(() =>
    acknowledgeInvitation(
      { ...ack, status: "PENDING", acceptedAt: "2026-10-21T00:00:00Z" },
      input,
    ),
  );
});
test("closed invitations have no resend/revoke controls; delivery messages never claim inbox receipt", () => {
  for (const status of ["ACCEPTED", "REVOKED"] as const)
    assert.equal(canManageInvitation({ status }), false);
  for (const status of ["PENDING", "EXPIRED"] as const)
    assert.equal(canManageInvitation({ status }), true);
  assert.match(deliveryMessage("ACCEPTED"), /Inbox delivery is not confirmed/);
  assert.match(deliveryMessage("FAILED"), /invitation is stored/);
  assert.match(deliveryMessage("PENDING"), /queued/);
});
test("uncertain mutations require reconciliation and timestamps use Kigali", () => {
  for (const error of [
    new Error("malformed"),
    new ApiError(0, "NETWORK_ERROR", "offline"),
    new ApiError(503, "FAILED", "unavailable"),
  ])
    assert.equal(uncertainResult(error), true);
  assert.equal(
    uncertainResult(new ApiError(409, "INVITATION_EXISTS", "existing")),
    false,
  );
  assert.match(formatPeopleTime("2026-10-20T23:30:00Z"), /21 Oct 2026/);
});
test("people login return routes are Coordinator-only", () => {
  const user: User = {
    id: ids.person,
    name: "Staff",
    email: "staff@example.test",
    role: "COORDINATOR",
    classYear: null,
    hasRoundtable: false,
    roundtableId: null,
  };
  assert.equal(permittedNext("/people", user), "/people");
  assert.equal(
    permittedNext("/people", { ...user, role: "SPONSOR" }),
    "/dashboard",
  );
  assert.equal(
    permittedNext("/people", {
      ...user,
      role: "FACILITATOR",
      hasRoundtable: true,
    }),
    "/my-roundtable",
  );
  assert.equal(permittedNext("/people/anything", user), "/dashboard");
});
