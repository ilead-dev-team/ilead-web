import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { user, notice, reminder, meta } from "../tests/fixtures/notifications";
async function setup(page: Page, role = "COORDINATOR") {
  const calls: { path: string; method: string; body: unknown }[] = [];
  let read = false,
    snoozedUntil: string | null = null;
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace("/api/v1", "");
    calls.push({
      path: path + url.search,
      method: req.method(),
      body: req.postData() ? req.postDataJSON() : null,
    });
    if (path === "/auth/me")
      return route.fulfill({ json: { data: { ...user, role } } });
    if (path === "/notifications/unread-count")
      return route.fulfill({ json: { data: { count: read ? 0 : 1 } } });
    if (path === `/notifications/${notice.id}/read`) {
      read = true;
      return route.fulfill({
        json: { data: { ...notice, readAt: notice.createdAt } },
      });
    }
    if (path === "/notifications/read-all") {
      read = true;
      return route.fulfill({ json: { data: { updated: 1 } } });
    }
    if (path === "/notifications") {
      const pageSize = Number(url.searchParams.get("pageSize")),
        current = Number(url.searchParams.get("page"));
      const data =
        (read && url.searchParams.get("unread") === "true") || current > 1
          ? []
          : [{ ...notice, readAt: read ? notice.createdAt : null }];
      return route.fulfill({
        json: {
          data,
          meta: {
            ...meta,
            page: current,
            pageSize,
            total: 21,
            totalPages: Math.ceil(21 / pageSize),
          },
        },
      });
    }
    if (path === "/reminders")
      return route.fulfill({
        json: {
          data: role === "COORDINATOR" ? [{ ...reminder, snoozedUntil }] : [],
          meta: {
            ...meta,
            total: role === "COORDINATOR" ? 1 : 0,
            totalPages: role === "COORDINATOR" ? 1 : 0,
          },
        },
      });
    if (path === `/reminders/${reminder.id}/snooze`) {
      snoozedUntil = "2026-10-23T06:00:00.000Z";
      return route.fulfill({ json: { data: { ...reminder, snoozedUntil } } });
    }
    return route.fulfill({
      status: 404,
      json: {
        error: { code: "NOT_FOUND", message: "Fixture endpoint missing" },
      },
    });
  });
  return calls;
}
test("inbox pages and unread filters; read acknowledgement refreshes count and read-all", async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto("/notifications");
  const inbox = page.getByRole("region", {
    name: "Notification inbox",
    exact: true,
  });
  await expect(
    inbox.getByRole("article", { name: "Report due" }),
  ).toBeVisible();
  await expect(
    inbox.getByRole("link", { name: "Open", exact: true }),
  ).toHaveAttribute("href", notice.link);
  expect(calls.some((c) => c.path.includes("pageSize=10"))).toBe(false);
  await inbox
    .getByRole("button", { name: "Next notifications", exact: true })
    .click();
  await expect(inbox.getByText("Page 2 of 2")).toBeVisible();
  await inbox
    .getByRole("button", { name: "Unread notifications", exact: true })
    .click();
  await inbox.getByRole("button", { name: "Mark read", exact: true }).click();
  await expect(
    inbox.getByText("No unread notifications on this page."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Notifications, 0 unread", exact: true }),
  ).toBeVisible();
  await inbox
    .getByRole("button", { name: "All notifications", exact: true })
    .click();
  await inbox
    .getByRole("button", { name: "Mark all read", exact: true })
    .click();
  await expect(inbox.getByText("1 notification marked read.")).toBeVisible();
  expect(calls.filter((c) => c.method === "POST").map((c) => c.body)).toEqual([
    {},
    {},
  ]);
});
test("inline and active reminder snooze send numeric days and display returned Kigali time", async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto("/notifications");
  const card = page.getByRole("article", { name: "Report due", exact: true });
  await card.getByLabel("Snooze duration").selectOption("3");
  await card
    .getByRole("button", { name: "Snooze Report due", exact: true })
    .click();
  await expect(
    card.getByText(/Snoozed until 23 Oct 2026, 08:00 Kigali/),
  ).toBeVisible();
  const active = page.getByRole("region", {
    name: "My reminders",
    exact: true,
  });
  await expect(active.getByText("Sent 1 time of 3.")).toBeVisible();
  await active.getByLabel("Snooze duration").selectOption("2");
  await active
    .getByRole("button", {
      name: "Snooze Prepare a session report",
      exact: true,
    })
    .click();
  await expect(active.getByText(/The reminder remains active/)).toBeVisible();
  expect(
    calls.filter((c) => c.path.endsWith("/snooze")).map((c) => c.body),
  ).toEqual([{ days: 3 }, { days: 2 }]);
});
test("failed reads and resolved reminder snooze preserve state and offer refresh", async ({
  page,
}) => {
  await setup(page);
  await page.route(`**/api/v1/notifications/${notice.id}/read`, (r) =>
    r.fulfill({
      status: 503,
      json: { error: { code: "UNAVAILABLE", message: "Try again later" } },
    }),
  );
  await page.route(`**/api/v1/reminders/${reminder.id}/snooze`, (r) =>
    r.fulfill({
      status: 404,
      json: {
        error: { code: "NOT_FOUND", message: "Reminder no longer active" },
      },
    }),
  );
  await page.goto("/notifications");
  const card = page.getByRole("article", { name: "Report due", exact: true });
  await card.getByRole("button", { name: "Mark read", exact: true }).click();
  await expect(
    page.getByText(
      "iLead is unavailable right now. Wait a moment and try again.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(card.getByText("Unread", { exact: true })).toBeVisible();
  await card
    .getByRole("button", { name: "Snooze Report due", exact: true })
    .click();
  await expect(
    card.getByText("Reminder no longer active", { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Refresh reminder status" }),
  ).toBeVisible();
  await expect(card.getByText(/Snoozed until/)).toHaveCount(0);
});
test("bell lazy loads latest ten, Escape restores focus and outside click closes", async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto("/notifications");
  const bell = page.getByRole("button", {
    name: "Notifications, 1 unread",
    exact: true,
  });
  await bell.click();
  const panel = page.getByRole("region", {
    name: "Recent notifications",
    exact: true,
  });
  await expect(
    panel.getByRole("article", { name: "Report due" }),
  ).toBeVisible();
  expect(calls.some((c) => c.path.includes("pageSize=10"))).toBe(true);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(bell).toBeFocused();
  await bell.click();
  await page
    .getByRole("heading", { name: "My reminders", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
});
test("unregistered Facilitators retain notification access; legacy cards have reminder fallback", async ({
  page,
}) => {
  await setup(page, "FACILITATOR");
  await page.route("**/api/v1/notifications?**", (r) =>
    r.fulfill({
      json: {
        data: [
          {
            ...notice,
            type: "REGISTER_ROUNDTABLE_REMINDER",
            link: "/my-roundtable",
            reminderId: undefined,
          },
        ],
        meta,
      },
    }),
  );
  await page.goto("/notifications");
  await expect(
    page.getByRole("heading", { name: "Notifications", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open", exact: true }),
  ).toHaveAttribute("href", "/register-roundtable");
  await expect(
    page.getByRole("link", { name: "View active reminders and snooze" }),
  ).toHaveAttribute("href", "/notifications#reminders");
});
test("unsafe links are inert and Sponsor payloads fail closed with retry", async ({
  page,
}) => {
  await setup(page, "SPONSOR");
  await page.goto("/notifications");
  await expect(
    page.getByRole("button", { name: "Retry notifications", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.route("**/api/v1/notifications?**", (r) =>
    r.fulfill({
      json: {
        data: [
          {
            ...notice,
            type: "REPORT_SENT",
            reminderId: null,
            link: "https://evil.test",
          },
        ],
        meta,
      },
    }),
  );
  await page
    .getByRole("button", { name: "Retry notifications", exact: true })
    .click();
  await expect(
    page.getByText("Destination unavailable for this account."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open", exact: true }),
  ).toHaveCount(0);
});
test("unread count polls at sixty seconds and desktop disclosure stays accessible", async ({
  page,
}) => {
  const calls = await setup(page);
  await page.clock.install();
  await page.goto("/notifications");
  const bell = page.getByRole("button", {
    name: "Notifications, 1 unread",
    exact: true,
  });
  await expect(bell).toBeVisible();
  const before = calls.filter(
    (c) => c.path === "/notifications/unread-count",
  ).length;
  await page.clock.runFor(60010);
  await expect
    .poll(
      () =>
        calls.filter((c) => c.path === "/notifications/unread-count").length,
    )
    .toBeGreaterThan(before);
  await bell.click();
  await expect(
    page
      .getByRole("region", { name: "Recent notifications", exact: true })
      .getByRole("article"),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("bell-desktop.png") });
});
test("cold starts never pretend empty; failed lists and unread count can be retried", async ({
  page,
}) => {
  await setup(page);
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/notifications?**", async (r) => {
    await waiting;
    await r.fulfill({
      status: 503,
      json: { error: { message: "Unavailable" } },
    });
  });
  await page.route("**/api/v1/notifications/unread-count", (r) =>
    r.fulfill({ status: 503, json: { error: { message: "Unavailable" } } }),
  );
  await page.goto("/notifications");
  const inbox = page.getByRole("region", {
    name: "Notification inbox",
    exact: true,
  });
  await expect(inbox.getByText("Connecting to iLead…")).toBeVisible();
  await expect(inbox.getByText("No notifications on this page.")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", {
      name: "Notifications, unread count unavailable",
      exact: true,
    }),
  ).toBeVisible();
  release();
  await expect(
    inbox.getByRole("button", { name: "Retry notifications", exact: true }),
  ).toBeVisible();
  await page.route("**/api/v1/notifications?**", (r) =>
    r.fulfill({
      json: { data: [], meta: { ...meta, total: 0, totalPages: 0 } },
    }),
  );
  await inbox
    .getByRole("button", { name: "Retry notifications", exact: true })
    .click();
  await expect(inbox.getByText("No notifications on this page.")).toBeVisible();
});
test("mismatched read and snooze acknowledgements never claim success", async ({
  page,
}) => {
  await setup(page);
  await page.route(`**/api/v1/notifications/${notice.id}/read`, (r) =>
    r.fulfill({
      json: { data: { ...notice, id: user.id, readAt: notice.createdAt } },
    }),
  );
  await page.route(`**/api/v1/reminders/${reminder.id}/snooze`, (r) =>
    r.fulfill({
      json: {
        data: {
          ...reminder,
          id: user.id,
          snoozedUntil: "2026-10-23T06:00:00.000Z",
        },
      },
    }),
  );
  await page.goto("/notifications");
  const card = page.getByRole("article", { name: "Report due", exact: true });
  await card.getByRole("button", { name: "Mark read", exact: true }).click();
  await expect(
    page.getByText(/The read result could not be verified/),
  ).toBeVisible();
  await expect(card.getByText("Unread", { exact: true })).toBeVisible();
  await card
    .getByRole("button", { name: "Snooze Report due", exact: true })
    .click();
  await expect(
    card.getByText(/The snooze result could not be verified/),
  ).toBeVisible();
  await expect(card.getByText(/Snoozed until/)).toHaveCount(0);
});
for (const theme of ["light", "dark"])
  test(`notification mobile ${theme} theme has no overflow or accessibility violations`, async ({
    page,
  }) => {
    await setup(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      (value) => localStorage.setItem("ilead-theme", value),
      theme,
    );
    await page.goto("/notifications");
    await expect(
      page.getByRole("article", { name: "Report due", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Notifications, 1 unread", exact: true })
      .click();
    const panel = page.getByRole("region", {
      name: "Recent notifications",
      exact: true,
    });
    await expect(panel.getByRole("article")).toBeVisible();
    expect(
      await panel.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    ).not.toBe("rgba(0, 0, 0, 0)");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`bell-${theme}.png`),
    });
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: test.info().outputPath(`notifications-${theme}.png`),
      fullPage: true,
    });
  });
