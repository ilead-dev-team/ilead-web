import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../src/lib/api.js";
import { permittedNext } from "../src/lib/account.js";
import {
  calendarAcknowledgement,
  calendarDraft,
  calendarForm,
  calendarPatch,
  parseManagedPage,
  rebaseCalendar,
  uncertainCalendar,
} from "../src/lib/academic-management.js";
import { calendar, savedYear, meta } from "./fixtures/academic-management.js";
test("calendar accepts real inclusive dates, holiday gaps and trims names without timestamp conversion", () => {
  const value = calendarForm.parse({ ...calendar, label: "  2026/2027  " });
  assert.equal(value.label, calendar.label);
  assert.equal(value.startsOn, calendar.startsOn);
  assert.equal(
    calendarForm.safeParse({
      ...calendar,
      terms: [
        { ...calendar.terms[0]!, endsOn: calendar.terms[0]!.startsOn },
        ...calendar.terms.slice(1),
      ],
    }).success,
    true,
  );
});
test("calendar rejects impossible dates, reversed years, missing/repeated terms and inclusive overlap", () => {
  for (const value of [
    { ...calendar, startsOn: "0000-01-01" },
    { ...calendar, startsOn: "2026-02-30" },
    { ...calendar, endsOn: "2025-01-01" },
    { ...calendar, label: " " },
    { ...calendar, isCurrent: true },
    { ...calendar, terms: calendar.terms.slice(1) },
    {
      ...calendar,
      terms: [calendar.terms[0], calendar.terms[0], calendar.terms[2]],
    },
    {
      ...calendar,
      terms: calendar.terms.map((t) =>
        t.number === 2 ? { ...t, startsOn: "2026-12-18" } : t,
      ),
    },
    {
      ...calendar,
      terms: calendar.terms.map((t) =>
        t.number === 3 ? { ...t, endsOn: "2027-08-01" } : t,
      ),
    },
  ])
    assert.equal(calendarForm.safeParse(value).success, false);
});
test("edits send only changed fields and omit current state and server-owned term IDs", () => {
  assert.deepEqual(
    calendarPatch(savedYear, { ...calendar, label: "Next year" }),
    { label: "Next year" },
  );
  assert.deepEqual(calendarPatch(savedYear, calendarDraft(savedYear)), {});
  const patch = calendarPatch(savedYear, {
    ...calendar,
    terms: calendar.terms.map((t) => ({ ...t, name: `${t.name} revised` })),
  });
  assert.deepEqual(Object.keys(patch), ["terms"]);
  assert.ok(patch.terms?.every((t) => !("id" in t)));
});
test("save acknowledgements require matching content, current flag, identity and stable term IDs", () => {
  assert.equal(
    calendarAcknowledgement(savedYear, { ...calendar, makeCurrent: false }).id,
    savedYear.id,
  );
  assert.equal(
    calendarAcknowledgement(
      { ...savedYear, isCurrent: true },
      { makeCurrent: true },
      savedYear,
    ).isCurrent,
    true,
  );
  for (const value of [
    { ...savedYear, label: "Wrong" },
    { ...savedYear, isCurrent: true },
    {
      ...savedYear,
      terms: savedYear.terms.map((t) => ({ ...t, name: "Wrong" })),
    },
    { ...savedYear, terms: savedYear.terms.slice(1) },
  ])
    assert.throws(() =>
      calendarAcknowledgement(value, { ...calendar, makeCurrent: false }),
    );
  assert.throws(() =>
    calendarAcknowledgement(
      { ...savedYear, id: "44444444-4444-4444-8444-444444444444" },
      { label: calendar.label },
      savedYear,
    ),
  );
  assert.throws(() =>
    calendarAcknowledgement(
      {
        ...savedYear,
        terms: savedYear.terms.map((t, i) =>
          i ? t : { ...t, id: savedYear.id },
        ),
      },
      {},
      savedYear,
    ),
  );
});
test("managed pages reject duplicate IDs, wrong paging, malformed calendars and multiple current flags", () => {
  assert.equal(parseManagedPage({ data: [savedYear], meta }, 1).data.length, 1);
  assert.throws(() =>
    parseManagedPage({ data: [savedYear, savedYear], meta }, 1),
  );
  assert.throws(() =>
    parseManagedPage(
      { data: [savedYear], meta: { ...meta, totalPages: 2 } },
      1,
    ),
  );
  assert.throws(() => parseManagedPage({ data: [savedYear], meta }, 2));
  assert.throws(() =>
    parseManagedPage(
      {
        data: [
          { ...savedYear, isCurrent: true },
          {
            ...savedYear,
            id: "44444444-4444-4444-8444-444444444444",
            isCurrent: true,
          },
        ],
        meta,
      },
      1,
    ),
  );
});
test("explicit refresh preserves edited fields while taking unrelated fresh server values", () => {
  const draft = {
    ...calendar,
    terms: calendar.terms.map((t) =>
      t.number === 1 ? { ...t, name: "My edit" } : t,
    ),
  };
  const latest = {
    ...savedYear,
    label: "Another Coordinator's label",
    terms: savedYear.terms.map((t) =>
      t.number === 2 ? { ...t, endsOn: "2027-04-02" } : t,
    ),
  };
  const rebased = rebaseCalendar(savedYear, draft, latest);
  assert.equal(rebased.label, latest.label);
  assert.equal(rebased.terms[0]!.name, "My edit");
  assert.equal(rebased.terms[1]!.endsOn, "2027-04-02");
});
test("uncertain errors require reconciliation and settings login return is Coordinator-only", () => {
  assert.equal(uncertainCalendar(new ApiError(503, "UNAVAILABLE", "")), true);
  assert.equal(uncertainCalendar(new ApiError(0, "NETWORK_ERROR", "")), true);
  assert.equal(
    uncertainCalendar(new ApiError(409, "CALENDAR_HAS_SESSIONS", "")),
    false,
  );
  const user = {
    id: "u",
    name: "Ada",
    email: "ada@example.test",
    role: "COORDINATOR" as const,
    classYear: null,
    hasRoundtable: false,
    roundtableId: null,
  };
  assert.equal(
    permittedNext("/settings/academic-years", user),
    "/settings/academic-years",
  );
  assert.equal(
    permittedNext("/settings/academic-years", { ...user, role: "SPONSOR" }),
    "/dashboard",
  );
  assert.equal(
    permittedNext("/settings/academic-years", { ...user, role: "FACILITATOR" }),
    "/register-roundtable",
  );
});
