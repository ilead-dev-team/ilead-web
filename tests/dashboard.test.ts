import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chartGradient,
  dashboardFilters,
  emptyFilters,
  exportKinds,
  exportPath,
  filterQuery,
  parseFilters,
  parseSummary,
  validateXlsx,
  xlsxMime,
} from "../src/lib/dashboard.js";
import { ids, summary } from "./fixtures/dashboard.js";
test("dashboard filters validate the complete API contract, calendar dates and range", () => {
  assert.deepEqual(parseFilters(emptyFilters), {});
  assert.equal(filterQuery({ from: undefined }), "");
  const filters = parseFilters({
    ...emptyFilters,
    academicYearId: ids.year,
    termId: ids.term,
    classYear: "YEAR_1",
    level: "IDO",
    roundtableId: ids.roundtable,
    from: "2026-10-01",
    to: "2026-10-31",
  });
  for (const kind of exportKinds) {
    const params = new URL(`https://test${exportPath(kind, filters)}`)
      .searchParams;
    assert.deepEqual(Object.fromEntries(params), filters);
  }
  for (const invalid of [
    { from: "2026-02-30" },
    { from: "0000-01-01" },
    { from: "2026-10-20", to: "2026-10-01" },
    { level: "bad" },
    { roundtableId: "bad" },
    { extra: "x" },
  ])
    assert.equal(dashboardFilters.safeParse(invalid).success, false);
  assert.equal(filterQuery({ from: "2028-02-29" }), "from=2028-02-29");
  assert.throws(() => exportPath("../../auth/logout" as never, {}));
});
test("role-specific summaries fail closed on Sponsor draft counts, private people or unpublished status", () => {
  assert.equal(
    parseSummary(summary(), "COORDINATOR").cards.activeRoundtables,
    8,
  );
  assert.equal(
    parseSummary(summary("SPONSOR"), "SPONSOR").cards.activeRoundtables,
    8,
  );
  assert.throws(() => parseSummary(summary(), "SPONSOR"));
  const sponsor = summary("SPONSOR");
  assert.throws(() =>
    parseSummary({ ...sponsor, unregisteredFacilitators: [] }, "SPONSOR"),
  );
  assert.throws(() =>
    parseSummary(
      { ...sponsor, cards: { ...sponsor.cards, reportsAwaitingSend: 2 } },
      "SPONSOR",
    ),
  );
  assert.throws(() =>
    parseSummary(
      {
        ...sponsor,
        pies: {
          ...sponsor.pies,
          reportsByStatus: [{ key: "DRAFT", label: "Draft", value: 2 }],
        },
      },
      "SPONSOR",
    ),
  );
  assert.throws(() => parseSummary(sponsor, "FACILITATOR"));
});
test("summary validation rejects missing data, invalid IDs, negative or nonnumeric figures", () => {
  const data = summary();
  assert.throws(() => parseSummary({}, "COORDINATOR"));
  assert.throws(() => parseSummary(data, "COORDINATOR", ids.oldYear));
  for (const value of [-1, NaN, "8", Infinity])
    assert.throws(() =>
      parseSummary(
        { ...data, cards: { ...data.cards, activeRoundtables: value } },
        "COORDINATOR",
      ),
    );
  assert.throws(() =>
    parseSummary(
      {
        ...data,
        latestSessions: [{ id: "bad", date: "2026-02-30", status: "HELD" }],
      },
      "COORDINATOR",
    ),
  );
});
test("empty and large numeric charts never produce invalid gradients", () => {
  assert.equal(chartGradient([0, 0, 0]), "var(--muted)");
  assert.equal(chartGradient([]), "var(--muted)");
  const result = chartGradient([
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
    0,
  ]);
  assert.ok(result.includes("50%"));
  assert.ok(!result.includes("NaN"));
  assert.ok(!result.includes("Infinity"));
});
test("Excel download validates MIME, nonempty ZIP signature and bounded size before browser handoff", async () => {
  const file = new Blob([new Uint8Array([80, 75, 3, 4, 0])]);
  assert.equal(await validateXlsx(file, xlsxMime), file);
  for (const [blob, type] of [
    [new Blob([]), xlsxMime],
    [new Blob(["<html>error</html>"]), xlsxMime],
    [file, "application/json"],
    [file, null],
  ] as const)
    await assert.rejects(() => validateXlsx(blob, type));
  await assert.rejects(() =>
    validateXlsx(new Blob([new Uint8Array(20 * 1024 * 1024 + 1)]), xlsxMime),
  );
});
