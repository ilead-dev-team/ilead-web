import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const id = "22222222-2222-4222-8222-222222222222";
const user = {
  id: "u",
  name: "Person",
  email: "p@example.test",
  role: "COORDINATOR",
  classYear: "YEAR_2",
  hasRoundtable: true,
  roundtableId: id,
};
const row = {
  id,
  name: "Pinnacles",
  slogan: "Lead with care",
  classYear: "YEAR_2",
  currentLevel: "ICHOOSE",
  lastLesson: { id: "l1", number: 1, title: "Leadership" },
  nextLesson: { id: "l2", number: 2, title: "Purpose", level: "ICHOOSE" },
  status: "ACTIVE",
  completedAt: null,
  facilitator: { id: "f", name: "Facilitator", classYear: "YEAR_2" },
  enrolledAt: "2026-10-01T08:00:00.000Z",
};
const attendance = {
  met: 1,
  didNotMeet: 0,
  history: [
    {
      entryId: "entry",
      met: true,
      sessionId: "session",
      sessionDate: "2026-10-14",
      status: "HELD",
    },
  ],
};
test("Coordinator filters, confirms trash, and handles restore failures", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: user } }),
  );
  let deleted = false,
    restoreFail = true;
  await page.route("**/api/v1/roundtables?**", (r) => {
    const params = new URL(r.request().url()).searchParams;
    return r.fulfill({
      json: {
        data: deleted ? [] : [row],
        meta: {
          page: Number(params.get("page")),
          pageSize: 20,
          total: deleted ? 0 : 21,
          totalPages: deleted ? 0 : 2,
        },
      },
    });
  });
  await page.route(`**/api/v1/roundtables/${id}`, (r) => {
    expect(r.request().method()).toBe("DELETE");
    deleted = true;
    return r.fulfill({ status: 204 });
  });
  await page.route("**/api/v1/roundtables/trash?**", (r) =>
    r.fulfill({
      json: {
        data: deleted
          ? [
              {
                ...row,
                facilitator: null,
                deletedAt: row.enrolledAt,
                purgeAfter: "2026-10-31T08:00:00.000Z",
              },
            ]
          : [],
        meta: {
          page: 1,
          pageSize: 20,
          total: deleted ? 1 : 0,
          totalPages: deleted ? 1 : 0,
        },
      },
    }),
  );
  await page.route(`**/api/v1/roundtables/${id}/restore`, (r) => {
    if (restoreFail)
      return r.fulfill({
        status: 409,
        json: {
          error: {
            code: "RESTORE_BLOCKED",
            message: "The Facilitator already has a replacement roundtable",
          },
        },
      });
    deleted = false;
    return r.fulfill({ json: { data: row } });
  });
  await page.goto("/roundtables");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  const filtered = page.waitForRequest(
    (r) =>
      r.url().includes("roundtables?") && r.url().includes("status=COMPLETED"),
  );
  await page.getByLabel("Status", { exact: true }).selectOption("COMPLETED");
  expect(new URL((await filtered).url()).searchParams.get("page")).toBe("1");
  await page
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  expect(deleted).toBe(false);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(deleted).toBe(false);
  await page
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm move to trash" }).click();
  await expect(page.getByText("No matching roundtables.")).toBeVisible();
  await page.getByRole("link", { name: "Open trash" }).click();
  await page.getByRole("button", { name: "Restore roundtable" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "replacement roundtable",
  );
  restoreFail = false;
  await page.getByRole("button", { name: "Restore roundtable" }).click();
  await expect(page.getByText("No matching roundtables.")).toBeVisible();
});

test("Facilitator sees own histories and edits details without progress fields, preserving failed input", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: { ...user, role: "FACILITATOR" } } }),
  );
  let current = { ...row },
    fail = true;
  await page.route(`**/api/v1/roundtables/${id}`, (r) => {
    if (r.request().method() === "PATCH") {
      expect(r.request().postDataJSON()).toEqual({
        name: "Summits",
        slogan: row.slogan,
        classYear: "YEAR_2",
      });
      if (fail)
        return r.fulfill({
          status: 409,
          json: {
            error: {
              code: "ROUNDTABLE_NAME_SIMILAR",
              message: "Name is too similar",
            },
          },
        });
      current = { ...current, ...r.request().postDataJSON() };
      return r.fulfill({ json: { data: current } });
    }
    return r.fulfill({ json: { data: { ...current, attendance } } });
  });
  await page.route(`**/api/v1/roundtables/${id}/progress`, (r) =>
    r.fulfill({
      json: {
        data: {
          completed: [
            {
              lessonId: "l1",
              level: "ICHOOSE",
              number: 1,
              title: "Leadership",
              completedOn: null,
              sessionDate: null,
              source: "ENROLLMENT_BASELINE",
              recordedById: "u",
            },
            {
              lessonId: "l2",
              level: "ICHOOSE",
              number: 2,
              title: "Purpose",
              completedOn: "2026-10-14",
              sessionDate: "2026-10-14",
              source: "SESSION_ENTRY",
              recordedById: "c",
            },
          ],
        },
      },
    }),
  );
  await page.goto("/my-roundtable");
  await expect(page.getByText(/Before registration/)).toBeVisible();
  await expect(page.getByText("2026-10-14 · Met · Held session")).toBeVisible();
  await expect(page.getByLabel("Starting level")).toHaveCount(0);
  await page.getByLabel("Roundtable name", { exact: true }).fill("Summits");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Roundtable name", { exact: true })).toHaveValue(
    "Summits",
  );
  fail = false;
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("heading", { name: "Summits" })).toBeVisible();
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
    path: "artifacts/roundtable-mobile-dark.png",
    fullPage: true,
  });
});

test("Sponsor can inspect details but cannot edit or request trash", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: { ...user, role: "SPONSOR" } } }),
  );
  await page.route(`**/api/v1/roundtables/${id}`, (r) =>
    r.fulfill({ json: { data: { ...row, attendance } } }),
  );
  await page.route(`**/api/v1/roundtables/${id}/progress`, (r) =>
    r.fulfill({ json: { data: { completed: [] } } }),
  );
  let trashCalls = 0;
  await page.route("**/api/v1/roundtables/trash?**", (r) => {
    trashCalls++;
    return r.fulfill({ status: 403 });
  });
  await page.route("**/api/v1/dashboard/**", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  await page.goto(`/roundtables/${id}`);
  await expect(page.getByRole("heading", { name: "Pinnacles" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save details" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Move to trash" })).toHaveCount(
    0,
  );
  await page.goto("/roundtables/trash");
  await expect(page).toHaveURL(/dashboard/);
  expect(trashCalls).toBe(0);
});
