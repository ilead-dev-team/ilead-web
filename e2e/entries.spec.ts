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
    const firstRow = row(first, "Summits"),
      lastRow = row(second, "Pinnacles");
    const rows = [
      firstRow,
      ...Array.from({ length: 19 }, (_, i) =>
        row(
          `66666666-6666-4666-8666-${String(i).padStart(12, "0")}`,
          `Extra roundtable ${i + 1}`,
        ),
      ),
      lastRow,
    ];
    if (saved) {
      firstRow.entry = { met: true, level: "ICHOOSE", lessonId: lesson1 };
      lastRow.entry = { met: false, level: null, lessonId: null };
    }
    const filtered =
      params.get("onlyPending") === "true"
        ? rows.filter((r) => !r.entry)
        : rows;
    const pageNumber = Number(params.get("page"));
    return r.fulfill({
      json: {
        data: filtered.slice((pageNumber - 1) * 20, pageNumber * 20),
        meta: {
          page: Number(params.get("page")),
          pageSize: 20,
          total: filtered.length,
          totalPages: Math.ceil(filtered.length / 20),
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
  await expect(page.getByText("Entries saved.")).toBeVisible();
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
    page.getByRole("dialog", { name: "Review non-next lessons" }),
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
  await page.getByRole("button", { name: "Back to entries" }).click();
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
    page.getByRole("dialog", { name: "Review non-next lessons" }),
  ).toBeVisible();
  expect(calls).toBe(2);
  await page.getByRole("button", { name: "Confirm lessons and save" }).click();
  await expect(page.getByText("Entries saved.")).toBeVisible();
  expect(calls).toBe(3);
});

async function isolated(page: Page) {
  await page.route("https://**/*", (r) => r.abort());
  await page.route("**/api/v1/**", (r) =>
    r.fulfill({
      status: r.request().url().endsWith("/notifications/unread-count")
        ? 200
        : 404,
      json: r.request().url().endsWith("/notifications/unread-count")
        ? { data: { count: 0 } }
        : {
            error: {
              code: "NOT_FOUND",
              message: "Fixture endpoint unavailable",
            },
          },
    }),
  );
  await setup(page);
}
async function openEntries(page: Page) {
  await page.goto(`/sessions/${sessionId}`);
  await page.getByRole("button", { name: "Record or correct entries" }).click();
}
const singlePage = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
test("failed later entry pages keep drafts and offer a working Previous action", async ({
  page,
}) => {
  await isolated(page);
  await page.route(`**/api/v1/sessions/${sessionId}/entries?**`, (r) => {
    if (new URL(r.request().url()).searchParams.get("page") === "2")
      return r.fulfill({ status: 503, json: {} });
    return r.fulfill({
      json: {
        data: [
          row(first, "Summits"),
          ...Array.from({ length: 19 }, (_, i) =>
            row(
              `66666666-6666-4666-8666-${String(i).padStart(12, "0")}`,
              `Extra ${i + 1}`,
            ),
          ),
        ],
        meta: { ...singlePage, total: 21, totalPages: 2 },
      },
    });
  });
  await openEntries(page);
  await page
    .getByRole("group", { name: "Summits", exact: true })
    .getByLabel("Attendance")
    .selectOption("false");
  await page.getByRole("button", { name: "Next entries" }).click();
  await expect(
    page.getByRole("button", { name: "Retry entries and lessons" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changed entries" }),
  ).toBeDisabled();
  await expect(
    page.getByText("1 unsaved row, including other pages and filters."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous entries" }).click();
  await expect(
    page
      .getByRole("group", { name: "Summits", exact: true })
      .getByLabel("Attendance"),
  ).toHaveValue("false");
});
test("failed lesson refresh hides stale controls and retains drafts until a successful retry", async ({
  page,
}) => {
  await isolated(page);
  await page.clock.install({ time: new Date("2026-10-21T09:00:00Z") });
  let fail = false;
  await page.route("**/api/v1/curriculum", (r) =>
    fail ? r.fulfill({ status: 503, json: {} }) : r.fallback(),
  );
  await page.route(`**/api/v1/sessions/${sessionId}/entries?**`, (r) =>
    r.fulfill({ json: { data: [row(first, "Summits")], meta: singlePage } }),
  );
  await openEntries(page);
  await page.getByLabel("Attendance", { exact: true }).selectOption("true");
  fail = true;
  await page.clock.fastForward(31_000);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true })),
  );
  await expect(
    page.getByRole("button", { name: "Retry entries and lessons" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Summits", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save changed entries" }),
  ).toBeDisabled();
  await expect(
    page.getByText("1 unsaved row, including other pages and filters."),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Retry entries and lessons" }).click();
  await expect(page.getByLabel("Recorded lesson")).toHaveValue(lesson1);
  await expect(
    page.getByRole("button", { name: "Save changed entries" }),
  ).toBeEnabled();
});

test("mismatched entry pages remain uneditable until a valid retry", async ({
  page,
}) => {
  await isolated(page);
  let bad = true;
  await page.route(`**/api/v1/sessions/${sessionId}/entries?**`, (r) =>
    r.fulfill({
      json: {
        data: [row(first, "Summits")],
        meta: { ...singlePage, page: bad ? 2 : 1 },
      },
    }),
  );
  await openEntries(page);
  await expect(
    page.getByRole("button", { name: "Retry entries and lessons" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Summits", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save changed entries" }),
  ).toBeDisabled();
  bad = false;
  await page.getByRole("button", { name: "Retry entries and lessons" }).click();
  await expect(
    page.getByRole("group", { name: "Summits", exact: true }),
  ).toBeVisible();
});
test("successful entry save with failed refresh offers a read-only retry without repeating the write", async ({
  page,
}) => {
  await isolated(page);
  let saved = false,
    failRead = false,
    writes = 0;
  await page.route(`**/api/v1/sessions/${sessionId}/entries?**`, (r) =>
    r.fulfill(
      failRead
        ? { status: 503, json: {} }
        : {
            json: {
              data: [
                {
                  ...row(first, "Summits"),
                  entry: saved
                    ? { met: false, level: null, lessonId: null }
                    : null,
                },
              ],
              meta: singlePage,
            },
          },
    ),
  );
  await page.route(`**/api/v1/sessions/${sessionId}/entries`, (r) => {
    writes++;
    saved = true;
    failRead = true;
    return r.fulfill({
      json: { data: { saved: 1, warnings: [], errors: [] } },
    });
  });
  await openEntries(page);
  await page.getByLabel("Attendance", { exact: true }).selectOption("false");
  await page.getByRole("button", { name: "Save changed entries" }).click();
  await expect(page.getByText("Entries saved.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry refreshing saved views" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Summits", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save changed entries" }),
  ).toBeDisabled();
  failRead = false;
  await page
    .getByRole("button", { name: "Retry refreshing saved views" })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry refreshing saved views" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Attendance", { exact: true })).toHaveValue(
    "false",
  );
  expect(writes).toBe(1);
});
test("unrelated entry acknowledgement warnings retain drafts while a valid no-op retry succeeds", async ({
  page,
}) => {
  await isolated(page);
  let writes = 0;
  await page.route(`**/api/v1/sessions/${sessionId}/entries?**`, (r) =>
    r.fulfill({ json: { data: [row(first, "Summits")], meta: singlePage } }),
  );
  await page.route(`**/api/v1/sessions/${sessionId}/entries`, (r) => {
    writes++;
    return r.fulfill({
      json: {
        data: {
          saved: 0,
          errors: [],
          warnings:
            writes === 1
              ? [{ roundtableId: second, code: "LESSON_NOT_NEXT" }]
              : [],
        },
      },
    });
  });
  await openEntries(page);
  await page.getByLabel("Attendance", { exact: true }).selectOption("false");
  await page.getByRole("button", { name: "Save changed entries" }).click();
  await expect(
    page.getByText("1 unsaved row, including other pages and filters."),
  ).toBeVisible();
  await expect(page.getByText("Entries saved.", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Save changed entries" }).click();
  await expect(page.getByText("Entries saved.", { exact: true })).toBeVisible();
  expect(writes).toBe(2);
});
test("non-next review contains focus, restores it on Escape and blocks dismissal during a pending save", async ({
  page,
}) => {
  await isolated(page);
  let release!: () => void,
    writes = 0;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/v1/sessions/${sessionId}/entries?**`, (r) =>
    r.fulfill({ json: { data: [row(first, "Summits")], meta: singlePage } }),
  );
  await page.route(`**/api/v1/sessions/${sessionId}/entries`, async (r) => {
    writes++;
    expect(r.request().postDataJSON().entries[0].confirmNotNext).toBe(true);
    await pending;
    return r.fulfill({
      json: {
        data: {
          saved: 1,
          errors: [],
          warnings: [{ roundtableId: first, code: "LESSON_NOT_NEXT" }],
        },
      },
    });
  });
  await openEntries(page);
  await page.getByLabel("Attendance", { exact: true }).selectOption("true");
  await page.getByLabel("Recorded lesson").selectOption(lesson2);
  const save = page.getByRole("button", { name: "Save changed entries" });
  await save.click();
  const dialog = page.getByRole("dialog", { name: "Review non-next lessons" });
  await expect(
    dialog.getByRole("button", { name: "Back to entries" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Confirm lessons and save" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Back to entries" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(save).toBeFocused();
  await save.click();
  await dialog
    .getByRole("button", { name: "Confirm lessons and save" })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Back to entries" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Confirm lessons and save" })
    .dispatchEvent("click");
  expect(writes).toBe(1);
  release();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Attendance and lesson entries" }),
  ).toBeFocused();
});
for (const theme of ["light", "dark"])
  test(`entry review fits a narrow keyboard layout in ${theme} theme`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await isolated(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.addInitScript(
      (theme) => localStorage.setItem("ilead-theme", theme),
      theme,
    );
    await page.route(`**/api/v1/sessions/${sessionId}/entries?**`, (r) =>
      r.fulfill({
        json: {
          data: [
            row(
              first,
              "Summits leadership roundtable with a longer descriptive name",
            ),
          ],
          meta: singlePage,
        },
      }),
    );
    await openEntries(page);
    await page.getByLabel("Attendance", { exact: true }).selectOption("true");
    await page.getByLabel("Recorded lesson").selectOption(lesson2);
    await page.getByRole("button", { name: "Save changed entries" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Review non-next lessons",
    });
    await expect(
      dialog.getByRole("button", { name: "Back to entries" }),
    ).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(
      true,
    );
    await dialog.getByRole("button", { name: "Back to entries" }).focus();
    await page.screenshot({
      path: `test-results/entry-review-${theme}.png`,
      fullPage: false,
    });
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
