import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const user = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Ada",
  email: "ada@example.test",
  role: "COORDINATOR",
  classYear: null,
  hasRoundtable: false,
  roundtableId: null,
};
async function setup(page: Page, role = "COORDINATOR") {
  const calls: { path: string; method: string; body: unknown }[] = [];
  await page.route("**/api/v1/**", (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.replace("/api/v1", "");
    calls.push({
      path,
      method: req.method(),
      body: req.postData() ? req.postDataJSON() : null,
    });
    if (path === "/auth/me")
      return route.fulfill({ json: { data: { ...user, role } } });
    if (path === "/notifications/unread-count")
      return route.fulfill({ json: { data: { count: 0 } } });
    if (path === "/notifications" || path === "/reminders")
      return route.fulfill({
        json: {
          data: [],
          meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        },
      });
    if (path === "/push/subscriptions")
      return route.fulfill({ json: { data: [] } });
    if (path === "/auth/change-password") return route.fulfill({ status: 204 });
    return route.fulfill({
      status: 404,
      json: {
        error: { code: "NOT_FOUND", message: "Fixture endpoint missing" },
      },
    });
  });
  await page.goto("/notifications");
  await expect(
    page.getByRole("heading", { name: "Notifications", exact: true }),
  ).toBeVisible();
  return calls;
}
async function open(page: Page) {
  await page.getByText("Account", { exact: true }).click();
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Change password", exact: true });
}
async function fill(page: Page) {
  await page
    .getByLabel("Current password", { exact: true })
    .fill("Original123");
  await page.getByLabel("New password", { exact: true }).fill("Replacement456");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Replacement456");
}

test("workspace header fits narrow screens and matches approved breakpoints", async ({
  page,
}) => {
  await setup(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const box = await page.getByRole("banner").boundingBox();
    expect(box?.height).toBe(width < 768 ? 68 : 76);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    if (width < 768) await expect(menu).toBeVisible();
    else await expect(menu).not.toBeVisible();
    for (const name of ["Log out", "Notifications, 0 unread"]) {
      const bounds = await page
        .getByRole("button", { name, exact: true })
        .boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
  }
  await expect(
    page.getByRole("link", { name: "Program email", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/workspace-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Switch to .* mode/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/workspace-mobile-other-theme.png",
    fullPage: true,
  });
});
test("password success sends only two API fields, clears secrets and requires sign-in", async ({
  page,
}) => {
  const calls = await setup(page);
  const dialog = await open(page);
  await fill(page);
  await dialog.getByRole("button", { name: "Save password" }).click();
  await expect(dialog.getByRole("status")).toContainText("Password changed.");
  await expect(dialog.getByRole("status")).toBeFocused();
  expect(calls.filter((c) => c.path === "/auth/change-password")).toEqual([
    {
      path: "/auth/change-password",
      method: "POST",
      body: { currentPassword: "Original123", newPassword: "Replacement456" },
    },
  ]);
  await expect(dialog.locator('input[type="password"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Go to log in" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(calls.some((c) => c.path === "/auth/refresh")).toBe(false);
  expect(
    await page.evaluate(() =>
      Object.values(localStorage).some((v) =>
        /Original123|Replacement456/.test(v),
      ),
    ),
  ).toBe(false);
});
test("wrong current password retains entries without refresh and permits correction", async ({
  page,
}) => {
  const calls = await setup(page);
  let attempts = 0;
  await page.route("**/api/v1/auth/change-password", (route) => {
    attempts++;
    return route.fulfill({
      status: 401,
      json: {
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Current password is incorrect",
        },
      },
    });
  });
  const dialog = await open(page);
  await fill(page);
  await dialog.getByRole("button", { name: "Save password" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Current password is incorrect",
  );
  await expect(page.getByLabel("New password", { exact: true })).toHaveValue(
    "Replacement456",
  );
  expect(attempts).toBe(1);
  expect(calls.some((c) => c.path === "/auth/refresh")).toBe(false);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Change password", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(
    page.getByLabel("Current password", { exact: true }),
  ).toHaveValue("");
});
for (const mode of ["network", "server", "malformed"] as const)
  test(`uncertain ${mode} response blocks replay and clears secrets`, async ({
    page,
  }) => {
    await setup(page);
    let attempts = 0;
    await page.route("**/api/v1/auth/change-password", (route) => {
      attempts++;
      return mode === "network"
        ? route.abort("failed")
        : route.fulfill(
            mode === "server"
              ? {
                  status: 503,
                  json: {
                    error: { code: "UNAVAILABLE", message: "Unavailable" },
                  },
                }
              : { json: { data: { ok: true } } },
          );
    });
    const dialog = await open(page);
    await fill(page);
    await dialog.getByRole("button", { name: "Save password" }).click();
    await expect(dialog.getByRole("status")).toContainText("could not confirm");
    await expect(
      dialog.getByRole("button", { name: "Save password" }),
    ).toHaveCount(0);
    await expect(dialog.locator("input")).toHaveCount(0);
    expect(attempts).toBe(1);
  });
test("invalid new password is rejected before any mutation", async ({
  page,
}) => {
  const calls = await setup(page);
  const dialog = await open(page);
  await fill(page);
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Different789");
  await dialog.getByRole("button", { name: "Save password" }).click();
  await expect(dialog.getByRole("alert")).toContainText("do not match");
  expect(calls.filter((c) => c.path === "/auth/change-password")).toHaveLength(
    0,
  );
});
test("pending password save cannot be duplicated or cancelled", async ({
  page,
}) => {
  await setup(page);
  let release!: () => void,
    count = 0;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/auth/change-password", async (route) => {
    count++;
    await wait;
    await route.fulfill({ status: 204 });
  });
  const dialog = await open(page);
  await fill(page);
  await dialog.getByRole("button", { name: "Save password" }).click();
  await expect(
    dialog.getByRole("button", { name: "Changing password…" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog.getByRole("status")).toContainText("Password changed");
  expect(count).toBe(1);
});
test("account switched in another tab blocks submission before credentials are sent", async ({
  page,
}) => {
  const calls = await setup(page);
  const dialog = await open(page);
  await fill(page);
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      json: { data: { ...user, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } },
    }),
  );
  await dialog.getByRole("button", { name: "Save password" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Your account changed");
  expect(calls.filter((c) => c.path === "/auth/change-password")).toHaveLength(
    0,
  );
});
test("password success stops local push and browser cleanup failure can be retried", async ({
  page,
}) => {
  await setup(page);
  // Explicit browser substitute installed after passive reconciliation.
  // No provider subscription, delivery or native permission prompt is used.
  await page.evaluate(() => {
    const state = { fail: true, unsubscribed: 0, closed: 0 };
    Object.defineProperty(window, "passwordPushFixture", { value: state });
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { permission: "granted" },
    });
    Object.defineProperty(window, "PushManager", {
      configurable: true,
      value: class {},
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: async () => {
          if (state.fail) throw new Error("Test browser cleanup failure");
          return {
            scope: location.origin + "/",
            active: { scriptURL: location.origin + "/push-worker.js" },
            pushManager: {
              getSubscription: async () => ({
                unsubscribe: async () => {
                  state.unsubscribed++;
                  return true;
                },
              }),
            },
            getNotifications: async () => [{ close: () => state.closed++ }],
          };
        },
      },
    });
    localStorage.setItem("ilead-push-binding-v1", "test-local-binding");
  });
  const dialog = await open(page);
  await fill(page);
  await dialog.getByRole("button", { name: "Save password" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "could not finish notification cleanup",
  );
  await page.evaluate(() => {
    (
      window as unknown as { passwordPushFixture: { fail: boolean } }
    ).passwordPushFixture.fail = false;
  });
  await dialog.getByRole("button", { name: "Retry device cleanup" }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      state: (window as unknown as { passwordPushFixture: unknown })
        .passwordPushFixture,
      binding: localStorage.getItem("ilead-push-binding-v1"),
    })),
  ).toEqual({
    state: { fail: false, unsubscribed: 1, closed: 1 },
    binding: null,
  });
});
test("navigation contains keyboard focus, closes on navigation and marks the active destination", async ({
  page,
}) => {
  await setup(page);
  await page.screenshot({
    path: "test-results/account-shell-desktop-light.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByText("Account", { exact: true }).click();
  const panel = page
    .getByRole("button", { name: "Change password", exact: true })
    .locator("..");
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .focus();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Change password", exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const nav = page.getByRole("dialog", { name: "Navigation", exact: true });
  await page.keyboard.press("Shift+Tab");
  await expect(
    nav.getByRole("link", { name: "Section library", exact: true }),
  ).toBeFocused();
  await nav.getByRole("link", { name: "Roundtables", exact: true }).click();
  await expect(page).toHaveURL(/\/roundtables$/);
  await expect(nav).not.toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page.getByRole("button", { name: "Menu", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("link", { name: "Roundtables", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});
for (const role of ["COORDINATOR", "SPONSOR", "FACILITATOR"])
  test(`${role} mobile drawer and password controls are accessible in both themes`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page, role);
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    await menu.click();
    const nav = page.getByRole("dialog", { name: "Navigation", exact: true });
    await expect(
      nav.getByRole("link", { name: "People", exact: true }),
    ).toHaveCount(role === "COORDINATOR" ? 1 : 0);
    await expect(
      nav.getByRole("link", { name: "Reports", exact: true }),
    ).toHaveCount(role !== "FACILITATOR" ? 1 : 0);
    await expect(
      nav.getByRole("link", { name: "Issues", exact: true }),
    ).toHaveCount(role === "COORDINATOR" ? 1 : 0);
    await expect(nav.getByRole("button", { name: "Close menu" })).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `test-results/account-shell-${role.toLowerCase()}-light.png`,
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(nav).not.toBeVisible();
    await expect(menu).toBeFocused();
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    const dialog = await open(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/account-shell-${role.toLowerCase()}-dark.png`,
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });
