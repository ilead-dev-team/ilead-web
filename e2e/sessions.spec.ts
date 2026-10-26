import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { id, activityId, record } from "../tests/fixtures/sessions";
const user = {
  id: "c",
  name: "Coordinator",
  email: "c@example.test",
  role: "COORDINATOR",
  classYear: null,
  hasRoundtable: false,
  roundtableId: null,
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
async function isolated(page: import("@playwright/test").Page) {
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
  await auth(page);
}
async function fillNew(page: import("@playwright/test").Page) {
  await page.getByLabel("Session date").fill(record.date);
  await page.getByLabel("Notes", { exact: true }).fill(record.notes);
  await page.getByRole("checkbox", { name: "Reflection" }).check();
}
test("unconfirmed creation blocks repeat writes until a valid empty date lookup", async ({
  page,
}) => {
  await isolated(page);
  let writes = 0,
    lookupFails = true;
  await page.route("**/api/v1/sessions", (r) => {
    writes++;
    return r.fulfill({
      status: 201,
      json: {
        data: writes === 1 ? { ...record, notes: "Wrong notes" } : record,
      },
    });
  });
  await page.route("**/api/v1/sessions?**", (r) =>
    r.fulfill(
      lookupFails
        ? { status: 503, json: {} }
        : {
            json: {
              data: [],
              meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
            },
          },
    ),
  );
  await page.route(`**/api/v1/sessions/${id}`, (r) =>
    r.fulfill({ json: { data: record } }),
  );
  await page.goto("/sessions/new");
  await fillNew(page);
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(
    page.getByRole("button", { name: "Create session" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
    record.notes,
  );
  await page.getByRole("button", { name: "Check saved state" }).click();
  await expect(
    page.getByRole("button", { name: "Create session" }),
  ).toBeDisabled();
  lookupFails = false;
  await page.getByRole("button", { name: "Check saved state" }).click();
  await expect(
    page.getByRole("button", { name: "Create session" }),
  ).toBeEnabled();
  expect(writes).toBe(1);
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page).toHaveURL(`/sessions/${id}`);
  expect(writes).toBe(2);
});
test("uncertain creation finds the existing date without creating another session", async ({
  page,
}) => {
  await isolated(page);
  let writes = 0;
  await page.route("**/api/v1/sessions", (r) => {
    writes++;
    return r.fulfill({ status: 503, json: {} });
  });
  await page.route("**/api/v1/sessions?**", (r) => {
    const params = new URL(r.request().url()).searchParams;
    expect(params.get("from")).toBe(record.date);
    expect(params.get("to")).toBe(record.date);
    return r.fulfill({
      json: {
        data: [record],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    });
  });
  await page.goto("/sessions/new");
  await fillNew(page);
  await page.getByRole("button", { name: "Create session" }).click();
  await page.getByRole("button", { name: "Check saved state" }).click();
  await expect(
    page.getByRole("link", { name: "Open saved session" }),
  ).toHaveAttribute("href", `/sessions/${id}`);
  await expect(
    page.getByRole("button", { name: "Create session" }),
  ).toBeDisabled();
  expect(writes).toBe(1);
});
test("uncertain edit preserves text, blocks lifecycle writes and requires a matching status read", async ({
  page,
}) => {
  await isolated(page);
  let current = { ...record },
    writes = 0,
    mismatch = false;
  await page.route(`**/api/v1/sessions/${id}`, (r) => {
    if (r.request().method() === "PATCH") {
      writes++;
      current = { ...current, notes: r.request().postDataJSON().notes };
      return r.fulfill({ status: 503, json: {} });
    }
    return r.fulfill({
      json: { data: mismatch ? { ...current, id: activityId } : current },
    });
  });
  await page.goto(`/sessions/${id}`);
  await page.getByLabel("Notes", { exact: true }).fill("Retained correction");
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save session", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Mark as cancelled" }),
  ).toBeDisabled();
  mismatch = true;
  await page.getByRole("button", { name: "Check saved state" }).click();
  await expect(
    page.getByRole("button", { name: "Save session", exact: true }),
  ).toBeDisabled();
  mismatch = false;
  await page.getByRole("button", { name: "Check saved state" }).click();
  await expect(
    page.getByRole("button", { name: "Save session", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
    "Retained correction",
  );
  await expect(page.getByText("Session saved.", { exact: true })).toHaveCount(
    0,
  );
  expect(writes).toBe(1);
});
test("unverified cancellation and reopening require read-only reconciliation", async ({
  page,
}) => {
  await isolated(page);
  let current = { ...record },
    reads = 0,
    cancels = 0,
    reopens = 0;
  await page.route(`**/api/v1/sessions/${id}`, (r) => {
    if (r.request().method() === "PATCH") {
      reopens++;
      current = { ...current, status: "HELD", cancellationReason: null };
      return r.fulfill({
        json: { data: { ...current, cancellationReason: "Stale reason" } },
      });
    }
    reads++;
    return r.fulfill({ json: { data: current } });
  });
  await page.route(`**/api/v1/sessions/${id}/cancel`, (r) => {
    cancels++;
    current = {
      ...current,
      status: "CANCELLED",
      cancellationReason: "Closure",
    };
    return r.fulfill({ json: { data: record } });
  });
  await page.goto(`/sessions/${id}`);
  await page.getByRole("button", { name: "Mark as cancelled" }).click();
  await page.getByLabel("Cancellation reason").fill("Closure");
  await page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm cancellation" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Cancellation reason")).toHaveValue("Closure");
  await expect(
    page.getByRole("button", { name: "Save session", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Check session status" }).click();
  await expect(
    page.getByRole("heading", { name: `${record.date} · Cancelled` }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark held again" }).click();
  await page.getByRole("button", { name: "Confirm held session" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm held session" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Check session status" }).click();
  await expect(
    page.getByRole("heading", { name: `${record.date} · Held` }),
  ).toBeVisible();
  expect(cancels).toBe(1);
  expect(reopens).toBe(1);
  expect(reads).toBeGreaterThanOrEqual(3);
});
test("pending session writes lock both forms and ignore duplicate submits", async ({
  page,
}) => {
  await isolated(page);
  let release!: () => void,
    writes = 0;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/v1/sessions/${id}`, async (r) => {
    if (r.request().method() === "PATCH") {
      writes++;
      await pending;
      return r.fulfill({
        json: { data: { ...record, notes: "Pending correction" } },
      });
    }
    return r.fulfill({ json: { data: record } });
  });
  await page.goto(`/sessions/${id}`);
  await page.getByLabel("Notes", { exact: true }).fill("Pending correction");
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mark as cancelled" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Notes", { exact: true })).toBeDisabled();
  await page
    .locator("form")
    .filter({ has: page.getByLabel("Notes", { exact: true }) })
    .dispatchEvent("submit");
  expect(writes).toBe(1);
  release();
  await expect(page.getByText("Session saved.", { exact: true })).toBeVisible();
  expect(writes).toBe(1);
});

test("uncertain lifecycle remains recoverable after a background status refresh remounts controls", async ({
  page,
}) => {
  await isolated(page);
  await page.clock.install({ time: new Date("2026-10-21T09:00:00Z") });
  let current = { ...record };
  await page.route(`**/api/v1/sessions/${id}`, (r) =>
    r.fulfill({ json: { data: current } }),
  );
  await page.route(`**/api/v1/sessions/${id}/cancel`, (r) => {
    current = {
      ...current,
      status: "CANCELLED",
      cancellationReason: "Closure",
    };
    return r.fulfill({ status: 503, json: {} });
  });
  await page.goto(`/sessions/${id}`);
  await page.getByRole("button", { name: "Mark as cancelled" }).click();
  await page.getByLabel("Cancellation reason").fill("Closure");
  await page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(
    page.getByRole("button", { name: "Check session status" }),
  ).toBeVisible();
  await page.clock.fastForward(31_000);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true })),
  );
  await expect(
    page.getByRole("heading", { name: `${record.date} · Cancelled` }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark held again" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Check session status" }).click();
  await expect(
    page.getByRole("button", { name: "Mark held again" }),
  ).toBeEnabled();
});

for (const theme of ["light", "dark"])
  test(`uncertain session creation remains readable at 320px in ${theme} theme`, async ({
    page,
  }) => {
    await isolated(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.addInitScript(
      (theme) => localStorage.setItem("ilead-theme", theme),
      theme,
    );
    await page.route("**/api/v1/sessions", (r) =>
      r.fulfill({ status: 503, json: {} }),
    );
    await page.goto("/sessions/new");
    await fillNew(page);
    await page.getByRole("button", { name: "Create session" }).click();
    await expect(
      page.getByRole("button", { name: "Check saved state" }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/session-uncertain-${theme}.png`,
      fullPage: true,
    });
  });
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

test("session table shows entry totals and report state with contained mobile scrolling", async ({
  page,
}, testInfo) => {
  await isolated(page);
  await page.route("**/api/v1/sessions?**", (r) =>
    r.fulfill({
      json: {
        data: [
          {
            ...record,
            counts: { roundtables: 4, met: 2, notMet: 1, pending: 1 },
            report: { id: "report", status: "CHANGES_REQUESTED" },
          },
        ],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    }),
  );
  await page.goto("/sessions");
  const table = page.getByRole("region", { name: "Sessions list" });
  await expect(table.getByText("3 of 4 entered")).toBeVisible();
  const year = (await page
    .getByLabel("Academic year", { exact: true })
    .boundingBox())!;
  const term = (await page.getByLabel("Term", { exact: true }).boundingBox())!;
  expect(Math.abs(year.y - term.y)).toBeLessThan(2);
  const date = (await page
    .getByLabel("To date", { exact: true })
    .boundingBox())!;
  const apply = (await page
    .getByRole("button", { name: "Apply dates" })
    .boundingBox())!;
  expect(Math.abs(date.y - apply.y)).toBeLessThan(2);
  expect(apply.width).toBeLessThan(200);

  await expect(
    table.getByText("Changes requested", { exact: true }),
  ).toBeVisible();
  await expect(table.getByText("Reflection", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "New session", exact: true }),
  ).toHaveAttribute("href", "/sessions/new");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("sessions-desktop.png"),
    fullPage: true,
  });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await table.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      true,
    );
  }
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("sessions-mobile-dark.png"),
    fullPage: true,
  });
});
