import { test } from "node:test";
import assert from "node:assert/strict";
import { permittedNext } from "../src/lib/account.js";
import {
  countResponse,
  notificationTarget,
  parseNotice,
  parseNotifications,
  parseReminders,
  readAcknowledgement,
  reminderState,
  reminderTarget,
  snoozeAcknowledgement,
  snoozeDays,
} from "../src/lib/notifications.js";
import { user, notice, reminder, meta } from "./fixtures/notifications.js";

test("notification pages validate audience, pagination, unread state and legacy references", () => {
  assert.equal(
    parseNotice({ ...notice, reminderId: undefined }, user.role).reminderId,
    null,
  );
  assert.equal(
    parseNotifications({ data: [notice], meta }, user.role, 1, 20, true).data
      .length,
    1,
  );
  for (const value of [
    { data: [notice, notice], meta },
    { data: [notice], meta: { ...meta, page: 2 } },
    { data: [notice], meta: { ...meta, totalPages: 2 } },
    { data: [{ ...notice, readAt: notice.createdAt }], meta },
  ])
    assert.throws(() => parseNotifications(value, user.role, 1, 20, true));
  assert.throws(() => parseNotice(notice, "SPONSOR"));
  assert.throws(() =>
    parseNotice({ ...notice, type: "REPORT_SENT" }, "SPONSOR"),
  );
  assert.equal(
    parseNotice({ ...notice, type: "REPORT_SENT", reminderId: null }, "SPONSOR")
      .type,
    "REPORT_SENT",
  );
  assert.throws(() =>
    parseNotice({ ...notice, data: { secret: "internal" } }, user.role),
  );
  assert.equal(countResponse.safeParse({ data: { count: -1 } }).success, false);
});
test("notification destinations reject external, encoded and unauthorized routes", () => {
  assert.equal(notificationTarget(notice.link, user), notice.link);
  for (const link of [
    "https://evil.test",
    "//evil.test",
    "/reports/%2e%2e",
    "/sessions/new?date=2026-02-30",
    "/sessions/new?date=0000-01-01",
    "/dashboard?redirect=evil",
    "/people",
    "/reports\\evil",
  ])
    assert.equal(notificationTarget(link, user), null);
  assert.equal(
    notificationTarget(`/reports/${notice.id}#comments`, {
      ...user,
      role: "SPONSOR",
    }),
    `/reports/${notice.id}#comments`,
  );
  assert.equal(
    notificationTarget(notice.link, { ...user, role: "SPONSOR" }),
    null,
  );
  const facilitator = { ...user, role: "FACILITATOR" as const };
  assert.equal(
    notificationTarget("/my-roundtable", facilitator),
    "/register-roundtable",
  );
  assert.equal(notificationTarget("/issues", facilitator), null);
  assert.equal(permittedNext("/notifications", facilitator), "/notifications");
  assert.equal(permittedNext("/issues", facilitator), "/register-roundtable");
});
test("read and snooze successes require the matching server acknowledgement", () => {
  assert.equal(
    readAcknowledgement(
      { ...notice, readAt: notice.createdAt },
      notice,
      user.role,
    ).id,
    notice.id,
  );
  assert.throws(() => readAcknowledgement(notice, notice, user.role));
  assert.throws(() =>
    readAcknowledgement(
      { ...notice, id: user.id, readAt: notice.createdAt },
      notice,
      user.role,
    ),
  );
  assert.equal(
    snoozeAcknowledgement(
      { ...reminder, snoozedUntil: "2026-10-23T06:00:00.000Z" },
      reminder.id,
      reminder.kind,
      user.role,
    ).sendCount,
    1,
  );
  assert.throws(() =>
    snoozeAcknowledgement(reminder, reminder.id, reminder.kind, user.role),
  );
  for (const value of [0, 4, "2", 1.5])
    assert.equal(snoozeDays.safeParse(value).success, false);
});
test("reminders enforce role, safe task destinations and server-timestamp status", () => {
  assert.equal(
    parseReminders({ data: [reminder], meta }, user.role, 1).data.length,
    1,
  );
  assert.throws(() => parseReminders({ data: [reminder], meta }, "SPONSOR", 1));
  assert.throws(() =>
    parseReminders({ data: [reminder], meta }, "FACILITATOR", 1),
  );
  assert.equal(reminderTarget(reminder, user), notice.link);
  assert.equal(reminderTarget({ ...reminder, refId: "unsafe" }, user), null);
  const now = Date.parse("2026-10-20T07:00:00Z");
  assert.equal(reminderState(reminder, now), "Due");
  assert.equal(
    reminderState({ ...reminder, snoozedUntil: "2026-10-21T06:00:00Z" }, now),
    "Snoozed",
  );
  assert.equal(
    reminderState({ ...reminder, sendCount: 3 }, now),
    "Send limit reached",
  );
});
