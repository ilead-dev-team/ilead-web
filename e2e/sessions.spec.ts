import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const id = "11111111-1111-4111-8111-111111111111",
  activityId = "22222222-2222-4222-8222-222222222222";
const user = {
  id: "c",
  name: "Coordinator",
  email: "c@example.test",
  role: "COORDINATOR",
  classYear: null,
  hasRoundtable: false,
  roundtableId: null,
};
const record = {
  id,
  date: "2026-10-14",
  status: "HELD",
  cancellationReason: null as string | null,
  notes: "Weekly meeting",
  academicYear: { id: "year", label: "2026–27" },
  term: { id: "term", number: 1, name: "Term 1" },
  createdBy: { id: "c", name: "Coordinator" },
  activities: [{ activityTypeId: activityId, name: "Reflection", held: true }],
  counts: { roundtables: 4, met: 0, notMet: 0, pending: 4 },
  report: null,
};
async function auth(
  page: import("@playwright/test").Page,
  role = "COORDINATOR",
) {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: { ...user, role } } }),
  );
  await page.route("**/api/v1/curriculum", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  await page.route("**/api/v1/academic-years?**", (r) =>
    r.fulfill({
      json: {
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
    }),
  );
  await page.route("**/api/v1/activity-types?**", (r) =>
    r.fulfill({
      json: {
        data: [
          { id: activityId, name: "Reflection", isActive: true, position: 0 },
        ],
        meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      },
    }),
  );
}
test("session creation preserves calendar errors, sends chosen activities and opens acknowledged detail", async ({
  page,
}) => {
  await auth(page);
  let fail = true;
  await page.route("**/api/v1/sessions", (r) => {
    expect(r.request().postDataJSON()).toEqual({
      date: record.date,
      notes: "Weekly meeting",
      activities: [{ activityTypeId: activityId, held: true }],
    });
    if (fail)
      return r.fulfill({
        status: 409,
        json: {
          error: {
            code: "SESSION_CALENDAR_MISSING",
            message: "Configure an academic year and term",
          },
        },
      });
    return r.fulfill({ status: 201, json: { data: record } });
  });
  await page.route(`**/api/v1/sessions/${id}`, (r) =>
    r.fulfill({ json: { data: record } }),
  );
  await page.goto("/sessions/new");
  await page.getByLabel("Session date").fill(record.date);
  await page.getByLabel("Notes", { exact: true }).fill("Weekly meeting");
  await page.getByRole("checkbox", { name: "Reflection" }).check();
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "academic year",
  );
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
    "Weekly meeting",
  );
  fail = false;
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page).toHaveURL(`/sessions/${id}`, { timeout: 20000 });
  await expect(
    page.getByRole("heading", { name: "2026-10-14 · Held" }),
  ).toBeVisible();
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
    path: "artifacts/session-mobile-dark.png",
    fullPage: true,
  });
});
test("editing retains inactive activities, cancellation failures retain reason, and reopening restores editing", async ({
  page,
}) => {
  await auth(page);
  let current = { ...record },
    cancelFail = true;
  const inactive = "33333333-3333-4333-8333-333333333333";
  current.activities = [
    ...record.activities,
    { activityTypeId: inactive, name: "Former activity", held: false },
  ];
  await page.route(`**/api/v1/sessions/${id}`, (r) => {
    if (r.request().method() === "PATCH") {
      const body = r.request().postDataJSON();
      if (body.status) {
        expect(body).toEqual({ status: "HELD" });
        current = { ...current, status: "HELD", cancellationReason: null };
      } else {
        expect(body.activities).toContainEqual({
          activityTypeId: inactive,
          held: false,
        });
        current = { ...current, notes: body.notes };
      }
    }
    return r.fulfill({ json: { data: current } });
  });
  await page.route(`**/api/v1/sessions/${id}/cancel`, (r) => {
    expect(r.request().postDataJSON()).toEqual({ reason: "School closure" });
    if (cancelFail)
      return r.fulfill({
        status: 409,
        json: {
          error: {
            code: "SESSION_HAS_ENTRIES",
            message:
              "Recorded entries must be corrected before cancelling this session",
          },
        },
      });
    current = {
      ...current,
      status: "CANCELLED",
      cancellationReason: "School closure",
    };
    return r.fulfill({ json: { data: current } });
  });
  await page.goto(`/sessions/${id}`);
  await expect(
    page.getByRole("checkbox", {
      name: "Former activity (inactive, retained)",
    }),
  ).toBeVisible();
  await page.getByLabel("Notes", { exact: true }).fill("Updated notes");
  await page.getByRole("button", { name: "Save session" }).click();
  await expect(page.getByText("Session saved.")).toBeVisible();
  await page.getByRole("button", { name: "Mark as cancelled" }).click();
  await page.getByLabel("Cancellation reason").fill("School closure");
  await page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Recorded entries",
  );
  await expect(page.getByLabel("Cancellation reason")).toHaveValue(
    "School closure",
  );
  cancelFail = false;
  await page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(
    page.getByRole("heading", { name: "2026-10-14 · Cancelled" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save session" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Mark held again" }).click();
  await page.getByRole("button", { name: "Confirm held session" }).click();
  await expect(
    page.getByRole("button", { name: "Save session" }),
  ).toBeVisible();
});
test("list resets page on filters and validates date ranges", async ({
  page,
}) => {
  await auth(page);
  await page.route("**/api/v1/sessions?**", (r) => {
    const params = new URL(r.request().url()).searchParams;
    return r.fulfill({
      json: {
        data: [record],
        meta: {
          page: Number(params.get("page")),
          pageSize: 20,
          total: 21,
          totalPages: 2,
        },
      },
    });
  });
  await page.goto("/sessions");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  const filtered = page.waitForRequest(
    (r) =>
      r.url().includes("sessions?") && r.url().includes("status=CANCELLED"),
  );
  await page.getByLabel("Status", { exact: true }).selectOption("CANCELLED");
  expect(new URL((await filtered).url()).searchParams.get("page")).toBe("1");
  await page.getByLabel("From date").fill("2026-10-20");
  await page.getByLabel("To date").fill("2026-10-01");
  await page.getByRole("button", { name: "Apply dates" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "end date",
  );
});
test("Sponsor and Facilitator cannot open Coordinator session screens", async ({
  page,
}) => {
  let reads = 0;
  await page.route("**/api/v1/sessions**", (r) => {
    reads++;
    return r.fulfill({ status: 403, json: {} });
  });
  await page.route("**/api/v1/dashboard/**", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  for (const role of ["SPONSOR", "FACILITATOR"]) {
    await auth(page, role);
    for (const path of ["/sessions", "/sessions/new", `/sessions/${id}`]) {
      await page.goto(path);
      await expect(page).toHaveURL(
        role === "SPONSOR" ? /dashboard/ : /register-roundtable/,
      );
    }
  }
  expect(reads).toBe(0);
});
