import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAcademicYears, academicPage } from "../src/lib/academic.js";
const year = {
  id: "11111111-1111-4111-8111-111111111111",
  label: "2026–27",
  startsOn: "2026-09-01",
  endsOn: "2027-07-31",
  isCurrent: true,
  terms: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      number: 1,
      name: "Term 1",
      startsOn: "2026-09-01",
      endsOn: "2026-12-20",
    },
  ],
};
test("calendar lookup reads every page and forwards cancellation", async () => {
  const previous = globalThis.fetch,
    urls: string[] = [];
  const abort = new AbortController();
  const signals: AbortSignal[] = [];
  globalThis.fetch = async (input, options) => {
    urls.push(String(input));
    assert.ok(options?.signal);
    signals.push(options.signal);
    const page = Number(
      new URL(String(input), "http://localhost").searchParams.get("page"),
    );
    return new Response(
      JSON.stringify({
        data: [
          {
            ...year,
            id: page === 1 ? year.id : "33333333-3333-4333-8333-333333333333",
          },
        ],
        meta: { page, pageSize: 20, total: 21, totalPages: 2 },
      }),
    );
  };
  try {
    assert.equal((await loadAcademicYears(abort.signal)).length, 2);
    assert.equal(urls.length, 2);
    assert.match(urls[1]!, /page=2/);
    abort.abort();
    assert.ok(signals.every((signal) => signal.aborted));
  } finally {
    globalThis.fetch = previous;
  }
});
test("calendar responses reject malformed identifiers and calendar dates", () => {
  for (const invalid of [
    { ...year, id: "not-an-id" },
    { ...year, startsOn: "2026-02-30" },
    { ...year, terms: [{ ...year.terms[0], number: 4 }] },
  ]) {
    assert.equal(
      academicPage.safeParse({
        data: [invalid],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      }).success,
      false,
    );
  }
});
