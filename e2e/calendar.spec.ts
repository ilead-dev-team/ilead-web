import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const firstYear = "11111111-1111-4111-8111-111111111111",
  secondYear = "22222222-2222-4222-8222-222222222222",
  firstTerm = "33333333-3333-4333-8333-333333333333",
  secondTerm = "44444444-4444-4444-8444-444444444444";
const year = (id: string, label: string, term: string) => ({
  id,
  label,
  startsOn: "2026-09-01",
  endsOn: "2027-07-31",
  isCurrent: id === firstYear,
  terms: [
    {
      id: term,
      number: 1,
      name: `${label} term`,
      startsOn: "2026-09-01",
      endsOn: "2026-12-20",
    },
  ],
});
const session = {
  id: "55555555-5555-4555-8555-555555555555",
  date: "2026-10-14",
  status: "HELD",
  cancellationReason: null,
  notes: "",
  academicYear: { id: firstYear, label: "2026–27" },
  term: { id: firstTerm, number: 1, name: "Term 1" },
  createdBy: { id: "c", name: "Coordinator" },
  activities: [],
  counts: { roundtables: 0, met: 0, notMet: 0, pending: 0 },
  report: null,
};
async function setup(page: Page) {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({
      json: {
        data: {
          id: "c",
          name: "Coordinator",
          email: "c@example.test",
          role: "COORDINATOR",
          classYear: null,
          hasRoundtable: false,
          roundtableId: null,
        },
      },
    }),
  );
  await page.route("**/api/v1/sessions?**", (r) => {
    const pageNumber = Number(
      new URL(r.request().url()).searchParams.get("page"),
    );
    return r.fulfill({
      json: {
        data: [session],
        meta: { page: pageNumber, pageSize: 20, total: 21, totalPages: 2 },
      },
    });
  });
}
test("calendar filters load all years, scope terms, reset paging and preserve other filters when cleared", async ({
  page,
}) => {
  await setup(page);
  const pages: string[] = [];
  await page.route("**/api/v1/academic-years?**", (r) => {
    const number = new URL(r.request().url()).searchParams.get("page")!;
    pages.push(number);
    return r.fulfill({
      json: {
        data: [
          number === "1"
            ? year(firstYear, "2026–27", firstTerm)
            : year(secondYear, "2025–26", secondTerm),
        ],
        meta: { page: Number(number), pageSize: 20, total: 21, totalPages: 2 },
      },
    });
  });
  await page.goto("/sessions");
  await expect(page.getByLabel("Term", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Academic year")).toBeEnabled();
  expect([...new Set(pages)]).toEqual(["1", "2"]);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  const selected = page.waitForRequest(
    (r) =>
      r.url().includes("sessions?") &&
      r.url().includes(`academicYearId=${firstYear}`),
  );
  await page.getByLabel("Academic year").selectOption(firstYear);
  expect(new URL((await selected).url()).searchParams.get("page")).toBe("1");
  await expect(
    page.getByLabel("Term", { exact: true }).getByRole("option"),
  ).toHaveCount(2);
  await expect(
    page
      .getByLabel("Term", { exact: true })
      .getByRole("option", { name: "2025–26 term" }),
  ).toHaveCount(0);
  const termRequest = page.waitForRequest((r) =>
    r.url().includes(`termId=${firstTerm}`),
  );
  await page.getByLabel("Term", { exact: true }).selectOption(firstTerm);
  await termRequest;
  const changed = page.waitForRequest(
    (r) =>
      r.url().includes("sessions?") &&
      r.url().includes(`academicYearId=${secondYear}`),
  );
  await page.getByLabel("Academic year").selectOption(secondYear);
  const changedParams = new URL((await changed).url()).searchParams;
  expect(changedParams.has("termId")).toBe(false);
  expect(changedParams.get("page")).toBe("1");
  await expect(page.getByLabel("Term", { exact: true })).toHaveValue("");
  await page.getByLabel("Status", { exact: true }).selectOption("HELD");
  await page.getByLabel("From date").fill("2026-10-01");
  await page.getByLabel("To date").fill("2026-10-31");
  const dated = page.waitForRequest((r) => r.url().includes("from=2026-10-01"));
  await page.getByRole("button", { name: "Apply dates" }).click();
  await dated;
  const clear = page.waitForRequest(
    (r) =>
      r.url().includes("sessions?") &&
      !r.url().includes("academicYearId=") &&
      r.url().includes("from="),
  );
  await page.getByRole("button", { name: "Clear calendar filters" }).click();
  const params = new URL((await clear).url()).searchParams;
  expect(params.has("termId")).toBe(false);
  expect(params.get("status")).toBe("HELD");
  expect(params.get("from")).toBe("2026-10-01");
  expect(params.get("to")).toBe("2026-10-31");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "artifacts/session-calendar-mobile-dark.png",
    fullPage: true,
  });
});
test("calendar load failure preserves session browsing and supports an explicit retry", async ({
  page,
}) => {
  await setup(page);
  let fail = true;
  await page.route("**/api/v1/academic-years?**", (r) =>
    fail
      ? r.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
        })
      : r.fulfill({
          json: {
            data: [year(firstYear, "2026–27", firstTerm)],
            meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          },
        }),
  );
  await page.goto("/sessions");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "iLead is unavailable",
  );
  await expect(page.getByRole("link", { name: "2026-10-14" })).toBeVisible();
  await expect(page.getByLabel("Academic year")).toBeDisabled();
  fail = false;
  await page.getByRole("button", { name: "Retry calendar" }).click();
  await expect(page.getByLabel("Academic year")).toBeEnabled();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});
test("an empty calendar does not invent years or terms or hide sessions", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/v1/academic-years?**", (r) =>
    r.fulfill({
      json: {
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
    }),
  );
  await page.goto("/sessions");
  await expect(
    page.getByText(
      "No academic years configured. Calendar filters will appear after setup.",
    ),
  ).toBeVisible();
  await expect(
    page.getByLabel("Academic year").getByRole("option"),
  ).toHaveCount(1);
  await expect(page.getByLabel("Term", { exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "2026-10-14" })).toBeVisible();
});
