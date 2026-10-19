import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const sessionId = "11111111-1111-4111-8111-111111111111",
  first = "22222222-2222-4222-8222-222222222222",
  second = "33333333-3333-4333-8333-333333333333",
  lesson1 = "44444444-4444-4444-8444-444444444444",
  lesson2 = "55555555-5555-4555-8555-555555555555";
const user = {
  id: "c",
  name: "Coordinator",
  email: "c@example.test",
  role: "COORDINATOR",
  classYear: null,
  hasRoundtable: false,
  roundtableId: null,
};
const row = (id: string, name: string) => ({
  roundtable: { id, name, currentLevel: "ICHOOSE", classYear: "YEAR_1" },
  entry: null as {
    met: boolean;
    level: string | null;
    lessonId: string | null;
  } | null,
  suggested: {
    level: "ICHOOSE",
    lessonId: lesson1,
    number: 1,
    title: "Leadership",
  },
});
async function setup(page: Page, cancelled = false) {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: user } }),
  );
  await page.route(`**/api/v1/sessions/${sessionId}`, (r) =>
    r.fulfill({
      json: {
        data: {
          id: sessionId,
          date: "2026-10-14",
          status: cancelled ? "CANCELLED" : "HELD",
          cancellationReason: cancelled ? "Closure" : null,
          notes: "",
          academicYear: { id: "y", label: "2026–27" },
          term: { id: "t", number: 1, name: "Term 1" },
          createdBy: { id: "c", name: "Coordinator" },
          activities: [],
          counts: { roundtables: 21, met: 0, notMet: 0, pending: 21 },
          report: null,
        },
      },
    }),
  );
  await page.route("**/api/v1/activity-types?**", (r) =>
    r.fulfill({
      json: {
        data: [],
        meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
      },
    }),
  );
  await page.route("**/api/v1/curriculum", (r) =>
    r.fulfill({
      json: {
        data: {
          levels: [
            {
              key: "ICHOOSE",
              label: "iChoose",
              order: 1,
              lessons: [
                { id: lesson1, number: 1, title: "Leadership" },
                { id: lesson2, number: 2, title: "Purpose" },
              ],
            },
          ],
        },
      },
    }),
  );
}
test("drafts survive pages and filters, failed save preserves all rows, and only touched rows are sent", async ({
  page,
}) => {
  const keyWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("same key")) keyWarnings.push(message.text());
  });
  await setup(page);
  let saved = false,
    fail = true;
  const bodies: unknown[] = [];
  await page.route(`**/api/v1/sessions/${sessionId}/entries?**`, (r) => {
    const params = new URL(r.request().url()).searchParams;
    const item =
      params.get("page") === "2"
        ? row(second, "Pinnacles")
        : row(first, "Summits");
    if (saved)
      item.entry = {
        met: item.roundtable.id === first,
        level: item.roundtable.id === first ? "ICHOOSE" : null,
        lessonId: item.roundtable.id === first ? lesson1 : null,
      };
    return r.fulfill({
      json: {
        data: [item],
        meta: {
          page: Number(params.get("page")),
          pageSize: 20,
          total: 21,
          totalPages: 2,
        },
      },
    });
  });
  await page.route(`**/api/v1/sessions/${sessionId}/entries`, (r) => {
    bodies.push(r.request().postDataJSON());
    if (fail)
      return r.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
      });
    saved = true;
    return r.fulfill({
      json: { data: { saved: 2, warnings: [], errors: [] } },
    });
  });
  await page.goto(`/sessions/${sessionId}`);
  await page.getByRole("button", { name: "Record or correct entries" }).click();
  await page
    .getByRole("group", { name: "Summits", exact: true })
    .getByLabel("Attendance")
    .selectOption("true");
  await page.getByRole("button", { name: "Next entries" }).click();
  await page
    .getByRole("group", { name: "Pinnacles", exact: true })
    .getByLabel("Attendance")
    .selectOption("false");
  await page.getByRole("checkbox", { name: "Only pending" }).check();
  await expect(
    page.getByText("2 unsaved rows, including other pages and filters."),
  ).toBeVisible();
  await expect(
    page
      .getByRole("group", { name: "Summits", exact: true })
      .getByLabel("Attendance"),
  ).toHaveValue("true");
  await expect(
    page.getByRole("button", { name: "Mark as cancelled" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Save changed entries" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "iLead is unavailable",
  );
  await expect(
    page.getByText("2 unsaved rows, including other pages and filters."),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Save changed entries" }).click();
  await expect(
    page.getByText(
      "Entries saved. Progress and attendance have been refreshed.",
    ),
  ).toBeVisible();
  expect(bodies).toEqual(
    Array(2).fill({
      entries: [
        {
          roundtableId: first,
          met: true,
          level: "ICHOOSE",
          lessonId: lesson1,
          confirmNotNext: false,
        },
        { roundtableId: second, met: false },
      ],
    }),
  );
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
    path: "artifacts/entries-mobile-dark.png",
    fullPage: true,
  });
  expect(keyWarnings).toEqual([]);
});
test("non-next review requires explicit confirmation and backend row errors preserve the chosen lesson", async ({
  page,
}) => {
  await setup(page);
  const current = row(first, "Summits");
  current.entry = { met: true, level: "ICHOOSE", lessonId: lesson1 };
  await page.route(`**/api/v1/sessions/${sessionId}/entries?**`, (r) =>
    r.fulfill({
      json: {
        data: [current],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    }),
  );
  let calls = 0;
  await page.route(`**/api/v1/sessions/${sessionId}/entries`, (r) => {
    calls++;
    expect(r.request().postDataJSON()).toEqual({
      entries: [
        {
          roundtableId: first,
          met: true,
          level: "ICHOOSE",
          lessonId: lesson2,
          confirmNotNext: true,
        },
      ],
    });
    return r.fulfill({
      status: 422,
      json: {
        error: {
          code: "ENTRY_VALIDATION_FAILED",
          message: "No entries were saved.",
          details: {
            saved: 0,
            warnings: [],
            errors: [{ roundtableId: first, code: "LESSON_ALREADY_COMPLETED" }],
          },
        },
      },
    });
  });
  await page.goto(`/sessions/${sessionId}`);
  await page.getByRole("button", { name: "Record or correct entries" }).click();
  await page
    .getByRole("group", { name: "Summits", exact: true })
    .getByLabel("Recorded lesson")
    .selectOption(lesson2);
  await page.getByRole("button", { name: "Save changed entries" }).click();
  await expect(
    page.getByRole("group", { name: "Confirm non-next lessons" }),
  ).toContainText("chosen iChoose 2. Purpose");
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Confirm lessons and save" }).click();
  await expect(page.getByLabel("Entry validation problems")).toContainText(
    "already completed",
  );
  await expect(
    page
      .getByRole("group", { name: "Summits", exact: true })
      .getByLabel("Recorded lesson"),
  ).toHaveValue(lesson2);
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Discard row change" }).click();
  await expect(
    page.getByText("0 unsaved rows, including other pages and filters."),
  ).toBeVisible();
});
test("invalid acknowledgements retain drafts and server warnings require a separate confirmed save", async ({
  page,
}) => {
  await setup(page);
  await page.route(`**/api/v1/sessions/${sessionId}/entries?**`, (r) =>
    r.fulfill({
      json: {
        data: [row(first, "Summits")],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    }),
  );
  let calls = 0;
  await page.route(`**/api/v1/sessions/${sessionId}/entries`, (r) => {
    calls++;
    expect(r.request().postDataJSON().entries[0].confirmNotNext).toBe(
      calls === 3,
    );
    if (calls === 1)
      return r.fulfill({
        json: { data: { saved: 101, warnings: [], errors: [] } },
      });
    if (calls === 2)
      return r.fulfill({
        status: 422,
        json: {
          error: {
            code: "LESSON_NOT_NEXT",
            message: "No entries were saved.",
            details: {
              saved: 0,
              warnings: [{ roundtableId: first, code: "LESSON_NOT_NEXT" }],
              errors: [],
            },
          },
        },
      });
    return r.fulfill({
      json: { data: { saved: 1, warnings: [], errors: [] } },
    });
  });
  await page.goto(`/sessions/${sessionId}`);
  await page.getByRole("button", { name: "Record or correct entries" }).click();
  await page
    .getByRole("group", { name: "Summits", exact: true })
    .getByLabel("Attendance")
    .selectOption("true");
  await page.getByRole("button", { name: "Save changed entries" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Something went wrong",
  );
  await expect(
    page.getByText("1 unsaved row, including other pages and filters."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save changed entries" }).click();
  await expect(
    page.getByRole("group", { name: "Confirm non-next lessons" }),
  ).toBeVisible();
  expect(calls).toBe(2);
  await page.getByRole("button", { name: "Confirm lessons and save" }).click();
  await expect(
    page.getByText(
      "Entries saved. Progress and attendance have been refreshed.",
    ),
  ).toBeVisible();
  expect(calls).toBe(3);
});

test("cancelled sessions never load an entry editor", async ({ page }) => {
  await setup(page, true);
  let reads = 0;
  await page.route(`**/api/v1/sessions/${sessionId}/entries**`, (r) => {
    reads++;
    return r.fulfill({ status: 409, json: {} });
  });
  await page.goto(`/sessions/${sessionId}`);
  await expect(
    page.getByRole("heading", { name: "2026-10-14 · Cancelled" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record or correct entries" }),
  ).toHaveCount(0);
  expect(reads).toBe(0);
});
