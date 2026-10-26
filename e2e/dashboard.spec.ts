import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ids, summary, years, roundtable } from "../tests/fixtures/dashboard";
const mime =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
async function setup(page: Page, role = "COORDINATOR") {
  await page.route("**/api/v1/notifications/unread-count", (r) =>
    r.fulfill({ json: { data: { count: 0 } } }),
  );
  await page.route("**/api/v1/reminders?**", (r) =>
    r.fulfill({
      json: {
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
    }),
  );
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({
      json: {
        data: {
          id: ids.person,
          name: role === "SPONSOR" ? "Sponsor" : "Coordinator",
          email: "staff@example.test",
          role,
          classYear: null,
          hasRoundtable: false,
          roundtableId: null,
        },
      },
    }),
  );
  await page.route("**/api/v1/academic-years?**", (r) =>
    r.fulfill({
      json: {
        data: years,
        meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
      },
    }),
  );
  await page.route("**/api/v1/roundtables?**", (r) =>
    r.fulfill({
      json: {
        data: [roundtable],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    }),
  );
  await page.route("**/api/v1/dashboard/summary**", (r) =>
    r.fulfill({ json: { data: summary(role) } }),
  );
}
test("Coordinator dashboard renders program charts, counts, operational links and accessible numeric equivalents in both themes", async ({
  page,
}, testInfo) => {
  await setup(page);
  await page.goto("/dashboard");
  await expect(
    page.getByText("Academic year: 2026–27.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Reports awaiting sending", { exact: true }),
  ).toBeVisible();
  const overview = page.getByRole("region", {
    name: "Program overview",
    exact: true,
  });
  const filters = page.getByRole("region", {
    name: "Program filters",
    exact: true,
  });
  expect((await overview.boundingBox())!.y).toBeLessThan(
    (await filters.boundingBox())!.y,
  );
  await expect(page.getByLabel("From date", { exact: true })).toBeHidden();
  await expect(page.getByLabel("Academic year", { exact: true })).toBeVisible();
  expect(
    (await page.getByRole("heading", { name: /Welcome back/ }).boundingBox())!
      .height,
  ).toBeLessThan(80);
  await expect(
    page.getByRole("link", { name: "Create session", exact: true }),
  ).toHaveAttribute("href", "/sessions/new");
  const actionColors = await page
    .getByRole("link", { name: "Create session", exact: true })
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return { foreground: style.color, background: style.backgroundColor };
    });
  expect(actionColors.foreground).not.toBe(actionColors.background);
  await expect(
    page
      .getByRole("region", { name: "Roundtables by level", exact: true })
      .getByText("iChoose", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", {
        name: "Last held session attendance · 2026-10-14",
      })
      .getByText("Not recorded", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Unregistered Facilitators", exact: true })
      .getByText("Unregistered Person · Year 1"),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Latest sessions" })
      .getByRole("link", { name: "2026-10-14" }),
  ).toHaveAttribute("href", `/sessions/${ids.session}`);
  await page.screenshot({
    path: testInfo.outputPath("dashboard-light.png"),
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: /Switch to dark/i }).click();
  await page.screenshot({
    path: testInfo.outputPath("dashboard-dark.png"),
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("dashboard-tablet-dark.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("dashboard-mobile.png"),
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: /Switch to light/i }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("dashboard-mobile-light.png"),
    fullPage: true,
  });
});
test("Sponsor dashboard exposes received reports and count-only registration, without draft details or session edit links", async ({
  page,
}) => {
  await setup(page, "SPONSOR");
  await page.goto("/dashboard");
  await expect(
    page.getByText("Reports received", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Reports awaiting sending", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Unregistered Person", { exact: false }),
  ).toHaveCount(0);
  await expect(page.getByText("Draft", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Latest sessions" }).getByRole("link"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Download Excel" }),
  ).toBeEnabled();
});
test("all applied filters reach both summary and each Excel dataset; drafts disable exports and year changes clear term", async ({
  page,
}) => {
  await setup(page);
  const exports: string[] = [];
  const summaries: string[] = [];
  await page.route("**/api/v1/dashboard/summary**", (r) => {
    summaries.push(r.request().url());
    return r.fulfill({ json: { data: summary() } });
  });
  await page.route("**/api/v1/exports/**", (r) => {
    exports.push(r.request().url());
    return r.fulfill({
      contentType: mime,
      body: Buffer.from([80, 75, 3, 4, 0]),
    });
  });
  await page.goto("/dashboard");
  await page.getByText(/^More filters/).click();
  await expect(
    page.getByRole("button", { name: "Download Excel" }),
  ).toBeEnabled();
  await page
    .getByLabel("Academic year", { exact: true })
    .selectOption(ids.year);
  await page.getByLabel("Term", { exact: true }).selectOption(ids.term);
  await page.getByLabel("Class", { exact: true }).selectOption("YEAR_1");
  await page.getByLabel("Level", { exact: true }).selectOption("IDO");
  await page
    .getByLabel("Roundtable", { exact: true })
    .selectOption(ids.roundtable);
  await page.getByLabel("From date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("To date", { exact: true }).fill("2026-10-31");
  await expect(
    page.getByRole("button", { name: "Download Excel" }),
  ).toBeDisabled();
  const before = summaries.length;
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect.poll(() => summaries.length).toBeGreaterThan(before);
  const expected = {
    academicYearId: ids.year,
    termId: ids.term,
    classYear: "YEAR_1",
    level: "IDO",
    roundtableId: ids.roundtable,
    from: "2026-10-01",
    to: "2026-10-31",
  };
  expect(Object.fromEntries(new URL(summaries.at(-1)!).searchParams)).toEqual(
    expected,
  );
  for (const kind of ["roundtables", "progress", "attendance", "reports"]) {
    await page.getByLabel("Dataset", { exact: true }).selectOption(kind);
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Excel" }).click();
    expect((await event).suggestedFilename()).toBe(`iLead_${kind}.xlsx`);
    expect(Object.fromEntries(new URL(exports.at(-1)!).searchParams)).toEqual(
      expected,
    );
  }
  await page
    .getByLabel("Academic year", { exact: true })
    .selectOption(ids.oldYear);
  await expect(page.getByLabel("Term", { exact: true })).toHaveValue("");
  await expect(
    page
      .getByLabel("Term", { exact: true })
      .getByRole("option", { name: "Term 1", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page.getByLabel("Academic year", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.getByLabel("From date")).toHaveValue("");
});
test("invalid date ranges retain input without requesting a summary or export", async ({
  page,
}) => {
  await setup(page);
  let calls = 0;
  await page.route("**/api/v1/dashboard/summary**", (r) => {
    calls++;
    return r.fulfill({ json: { data: summary() } });
  });
  await page.goto("/dashboard");
  await page.getByText(/^More filters/).click();
  await expect(
    page.getByRole("button", { name: "Download Excel" }),
  ).toBeEnabled();
  const before = calls;
  await page.getByLabel("From date").fill("2026-10-31");
  await page.getByLabel("To date").fill("2026-10-01");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({
      hasText: /Check the filters|Narrow the filters|valid Excel file/,
    }),
  ).toContainText("From date on or before To date");
  expect(calls).toBe(before);
  await expect(page.getByLabel("From date")).toHaveValue("2026-10-31");
  await expect(
    page.getByRole("button", { name: "Download Excel" }),
  ).toBeDisabled();
});
test("download errors and wrong file responses never claim success; retry uses retained filters", async ({
  page,
}) => {
  await setup(page);
  let mode = 0;
  await page.route("**/api/v1/exports/**", (r) =>
    mode === 0
      ? r.fulfill({
          status: 422,
          json: {
            error: {
              code: "EXPORT_TOO_LARGE",
              message: "Narrow the filters and download again.",
            },
          },
        })
      : mode === 1
        ? r.fulfill({ contentType: mime, body: "<html>Error</html>" })
        : r.fulfill({
            contentType: mime,
            body: Buffer.from([80, 75, 3, 4, 0]),
          }),
  );
  await page.goto("/dashboard");
  await expect(
    page.getByRole("button", { name: "Download Excel" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Download Excel" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: /Check the filters|Narrow the filters|valid Excel file/,
    }),
  ).toContainText("Narrow the filters");
  await expect(page.getByText(/handed to your browser/)).toHaveCount(0);
  mode = 1;
  await page.getByRole("button", { name: "Download Excel" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: /Check the filters|Narrow the filters|valid Excel file/,
    }),
  ).toContainText("valid Excel file");
  await expect(page.getByText(/handed to your browser/)).toHaveCount(0);
  mode = 2;
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Excel" }).click();
  await event;
  await expect(
    page.getByRole("status").filter({ hasText: "handed to your browser" }),
  ).toBeVisible();
});
test("failed summary retries, keeps applied dates, and does not display cached figures or exports", async ({
  page,
}) => {
  await setup(page);
  let fail = false;
  await page.route("**/api/v1/dashboard/summary**", (r) =>
    fail
      ? r.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE" } } })
      : r.fulfill({ json: { data: summary() } }),
  );
  await page.goto("/dashboard");
  await page.getByText(/^More filters/).click();
  await expect(
    page.getByText("Reports awaiting sending", { exact: true }),
  ).toBeVisible();
  fail = true;
  await page.getByLabel("From date").fill("2026-10-01");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Could not load the dashboard." }),
  ).toBeVisible();
  await expect(
    page.getByText("Reports awaiting sending", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Download Excel" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("From date")).toHaveValue("2026-10-01");
  fail = false;
  await page.getByRole("button", { name: "Retry dashboard" }).click();
  await expect(
    page.getByRole("button", { name: "Download Excel" }),
  ).toBeEnabled();
});
test("missing year explains setup and empty summaries preserve genuine zero values", async ({
  page,
}) => {
  await setup(page);
  let missing = true;
  await page.route("**/api/v1/dashboard/summary**", (r) => {
    if (missing)
      return r.fulfill({
        status: 404,
        json: {
          error: {
            code: "ACADEMIC_YEAR_NOT_FOUND",
            message: "Select an academic year.",
          },
        },
      });
    const data = summary();
    for (const key of Object.keys(data.cards))
      data.cards[key as keyof typeof data.cards] = 0;
    data.stale = [];
    data.latestSessions = [];
    data.unregisteredFacilitators = [];
    data.pies.lastSessionAttendance = null as never;
    for (const rows of [
      data.pies.roundtablesByLevel,
      data.pies.roundtablesByClass,
      data.pies.reportsByStatus,
    ])
      rows.forEach((row) => {
        row.value = 0;
      });
    return r.fulfill({ json: { data } });
  });
  await page.goto("/dashboard");
  await expect(page.getByText(/ask a Coordinator to configure/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download Excel" }),
  ).toHaveCount(0);
  missing = false;
  await page.getByRole("button", { name: "Retry dashboard" }).click();
  await expect(
    page.getByText("No held sessions in this period."),
  ).toBeVisible();
  await expect(page.getByText("No sessions in this selection.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download Excel" }),
  ).toBeEnabled();
});
test("roundtable lookup supports bounded search and pagination while retaining the selection", async ({
  page,
}) => {
  await setup(page);
  const calls: URLSearchParams[] = [];
  await page.route("**/api/v1/roundtables?**", (r) => {
    const params = new URL(r.request().url()).searchParams;
    calls.push(params);
    return r.fulfill({
      json: {
        data: params.get("page") === "2" ? [] : [roundtable],
        meta: {
          page: Number(params.get("page")),
          pageSize: 20,
          total: 21,
          totalPages: 2,
        },
      },
    });
  });
  await page.goto("/dashboard");
  await page.getByText(/^More filters/).click();
  await page
    .getByLabel("Roundtable", { exact: true })
    .selectOption(ids.roundtable);
  await page.getByText("Find another roundtable", { exact: true }).click();
  await page.getByRole("button", { name: "Next roundtables" }).click();
  await expect(page.getByText("Roundtable page 2 of 2")).toBeVisible();
  await expect(page.getByLabel("Roundtable", { exact: true })).toHaveValue(
    ids.roundtable,
  );
  await page.getByLabel("Search roundtable names").fill("Pinnacles");
  await page
    .getByRole("button", { name: "Search roundtables", exact: true })
    .click();
  await expect.poll(() => calls.at(-1)?.get("q")).toBe("Pinnacles");
  expect(calls.at(-1)?.get("page")).toBe("1");
  expect(calls.at(-1)?.get("pageSize")).toBe("20");
});
test("Sponsor payload containing Coordinator-only data fails closed", async ({
  page,
}) => {
  await setup(page, "SPONSOR");
  await page.route("**/api/v1/dashboard/summary**", (r) =>
    r.fulfill({ json: { data: summary() } }),
  );
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Could not load the dashboard." }),
  ).toBeVisible();
  await expect(
    page.getByText("Unregistered Person", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Download Excel" }),
  ).toHaveCount(0);
});

test("slow dashboard requests explain cold start and Facilitators never request staff data", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/v1/dashboard/summary**", async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    await r.fulfill({ json: { data: summary() } });
  });
  await page.goto("/dashboard");
  await expect(
    page.getByText(
      "The server may be waking up. This can take a moment. Keep this page open.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByRole("button", { name: "Download Excel" }),
  ).toBeEnabled();
  await setup(page, "FACILITATOR");
  let reads = 0;
  await page.route("**/api/v1/dashboard/summary**", (r) => {
    reads++;
    return r.fulfill({ status: 403 });
  });
  await page.route("**/api/v1/curriculum", (r) =>
    r.fulfill({ json: { data: { levels: [] } } }),
  );
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/register-roundtable");
  expect(reads).toBe(0);
});
