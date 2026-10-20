import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createECDH } from "node:crypto";
import { user } from "../tests/fixtures/notifications";
const pair = createECDH("prime256v1");
pair.generateKeys();
const publicKey = pair.getPublicKey().toString("base64url");
const device = {
  id: "55555555-5555-4555-8555-555555555555",
  deviceLabel: "My laptop",
  createdAt: "2026-10-20T06:00:00.000Z",
};
const meta = { page: 1, pageSize: 20, total: 0, totalPages: 0 };
type BrowserState = {
  permission: NotificationPermission;
  choice: NotificationPermission;
  requests: number;
  registered: boolean;
  subscribed: boolean;
  unsubscribes: number;
  closed: number;
};
async function setup(
  page: Page,
  mode: "normal" | "blocked" | "unsupported" = "normal",
) {
  const calls: { path: string; method: string; body: unknown }[] = [];
  let registered = false;
  await page.addInitScript(
    ({ publicKey, mode }) => {
      const state = {
        permission: mode === "blocked" ? "denied" : "default",
        choice: "granted",
        requests: 0,
        registered: false,
        subscribed: false,
        unsubscribes: 0,
        closed: 0,
      };
      Object.defineProperty(window, "pushFixture", { value: state });
      if (mode === "unsupported") {
        Object.defineProperty(window, "PushManager", { value: undefined });
        Reflect.deleteProperty(window, "PushManager");
        return;
      }
      Object.defineProperty(window, "Notification", {
        value: {
          get permission() {
            return state.permission;
          },
          requestPermission: async () => {
            state.requests++;
            state.permission = state.choice;
            return state.permission;
          },
        },
      });
      const sub = {
        endpoint:
          "https://fcm.googleapis.com/fcm/send/explicit-test-substitute",
        options: {
          applicationServerKey: Uint8Array.from(
            atob(publicKey.replace(/-/g, "+").replace(/_/g, "/") + "="),
            (c) => c.charCodeAt(0),
          ).buffer,
        },
        toJSON: () => ({ keys: { p256dh: publicKey, auth: "test-only" } }),
        unsubscribe: async () => {
          state.subscribed = false;
          state.unsubscribes++;
          return true;
        },
      };
      const reg = {
        scope: location.origin + "/",
        active: {
          scriptURL: location.origin + "/push-worker.js",
          state: "activated",
        },
        getNotifications: async () => [
          {
            close: () => {
              state.closed++;
            },
          },
        ],
        pushManager: {
          getSubscription: async () => (state.subscribed ? sub : null),
          subscribe: async () => {
            state.subscribed = true;
            return sub;
          },
        },
      };
      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          getRegistration: async () => (state.registered ? reg : undefined),
          register: async () => {
            state.registered = true;
            return reg;
          },
        },
      });
    },
    { publicKey, mode },
  );
  await page.route("**/api/v1/**", (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.replace("/api/v1", "");
    calls.push({
      path,
      method: req.method(),
      body: req.postData() ? req.postDataJSON() : null,
    });
    if (path === "/auth/me") return route.fulfill({ json: { data: user } });
    if (path === "/auth/logout") {
      registered = false;
      return route.fulfill({ status: 204 });
    }
    if (path === "/notifications/unread-count")
      return route.fulfill({ json: { data: { count: 0 } } });
    if (path === "/notifications" || path === "/reminders")
      return route.fulfill({
        json: {
          data: [],
          meta: {
            ...meta,
            pageSize: Number(new URL(req.url()).searchParams.get("pageSize")),
          },
        },
      });
    if (path === "/push/public-key")
      return route.fulfill({ json: { data: { publicKey } } });
    if (path === "/push/subscriptions" && req.method() === "POST") {
      registered = true;
      return route.fulfill({ status: 201, json: { data: device } });
    }
    if (path === "/push/subscriptions")
      return route.fulfill({ json: { data: registered ? [device] : [] } });
    if (path === `/push/subscriptions/${device.id}`) {
      registered = false;
      return route.fulfill({ status: 204 });
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
const panel = (page: Page) =>
  page.getByRole("region", { name: "Device notifications", exact: true });
const state = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { pushFixture: BrowserState }).pushFixture,
  );
test("explicit enable registers only endpoint/keys/label and disables this device", async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto("/notifications");
  await expect(
    panel(page).getByText("This device: Not enabled", { exact: true }),
  ).toBeVisible();
  expect((await state(page)).requests).toBe(0);
  await panel(page).getByLabel("Device label (optional)").fill("My laptop");
  await panel(page)
    .getByRole("button", { name: "Enable notifications", exact: true })
    .click();
  await expect(
    panel(page).getByText("This device: Enabled", { exact: true }),
  ).toBeVisible();
  expect((await state(page)).requests).toBe(1);
  const body = calls.find(
    (c) => c.path === "/push/subscriptions" && c.method === "POST",
  )!.body as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["deviceLabel", "endpoint", "keys"]);
  const saved = await page.evaluate(() =>
    localStorage.getItem("ilead-push-binding-v1"),
  );
  expect(saved).not.toContain("https://");
  expect(saved).not.toContain("p256dh");
  await panel(page)
    .getByRole("button", { name: "Disable this device", exact: true })
    .click();
  await expect(
    panel(page).getByText("This device: Not enabled", { exact: true }),
  ).toBeVisible();
  expect((await state(page)).subscribed).toBe(false);
  expect(
    calls.some(
      (c) =>
        c.path === `/push/subscriptions/${device.id}` && c.method === "DELETE",
    ),
  ).toBe(true);
});
for (const mode of ["blocked", "unsupported"] as const)
  test(`${mode} browser keeps the inbox and guidance without permission requests`, async ({
    page,
  }) => {
    await setup(page, mode);
    await page.goto("/notifications");
    await expect(
      panel(page).getByText(
        `This device: ${mode === "blocked" ? "Blocked" : "Unsupported"}`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      panel(page).getByRole("button", {
        name: "Enable notifications",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: "Notifications", exact: true }),
    ).toBeVisible();
    await expect(panel(page).getByText(/Add to Home Screen/)).toBeVisible();
    expect((await state(page)).requests).toBe(0);
  });
test("denied native permission does not register or block use of the inbox", async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto("/notifications");
  await expect(
    panel(page).getByText("This device: Not enabled", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { pushFixture: BrowserState }).pushFixture.choice =
      "denied";
  });
  await panel(page)
    .getByRole("button", { name: "Enable notifications", exact: true })
    .click();
  await expect(panel(page).getByRole("alert")).toContainText("blocked");
  expect(calls.some((c) => c.method === "POST")).toBe(false);
  await panel(page)
    .getByRole("button", { name: "Refresh device status", exact: true })
    .click();
  await expect(
    panel(page).getByText("This device: Blocked", { exact: true }),
  ).toBeVisible();
});
test("failed registration unsubscribes locally and never displays enabled", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/v1/push/subscriptions", (r) =>
    r.request().method() === "POST"
      ? r.fulfill({ status: 503, json: { error: { message: "Unavailable" } } })
      : r.fulfill({ json: { data: [] } }),
  );
  await page.goto("/notifications");
  await expect(
    panel(page).getByText("This device: Not enabled", { exact: true }),
  ).toBeVisible();
  await panel(page)
    .getByRole("button", { name: "Enable notifications", exact: true })
    .click();
  await expect(
    panel(page).getByText("This device: Unavailable", { exact: true }),
  ).toBeVisible();
  expect((await state(page)).subscribed).toBe(false);
  await expect(panel(page).getByRole("alert")).toBeVisible();
});
test("logout unsubscribes locally, removes current binding and clears stored device state", async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto("/notifications");
  await expect(
    panel(page).getByText("This device: Not enabled", { exact: true }),
  ).toBeVisible();
  await panel(page)
    .getByRole("button", { name: "Enable notifications", exact: true })
    .click();
  await expect(
    panel(page).getByText("This device: Enabled", { exact: true }),
  ).toBeVisible();
  let unsubscribedAtLogout = false;
  await page.route("**/api/v1/auth/logout", async (r) => {
    unsubscribedAtLogout = !(await state(page)).subscribed;
    calls.push({
      path: "/auth/logout",
      method: "POST",
      body: r.request().postDataJSON(),
    });
    await r.fulfill({ status: 204 });
  });
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(unsubscribedAtLogout).toBe(true);
  expect(calls.find((c) => c.path === "/auth/logout")?.body).toEqual({
    pushSubscriptionId: device.id,
  });
  expect(
    await page.evaluate(() => localStorage.getItem("ilead-push-binding-v1")),
  ).toBeNull();
});
test("remote device removal reconciles browser state and never automatically re-enables", async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto("/notifications");
  await expect(
    panel(page).getByText("This device: Not enabled", { exact: true }),
  ).toBeVisible();
  await panel(page)
    .getByRole("button", { name: "Enable notifications", exact: true })
    .click();
  await expect(
    panel(page).getByText("This device: Enabled", { exact: true }),
  ).toBeVisible();
  await panel(page)
    .getByRole("button", { name: "Remove device My laptop", exact: true })
    .click();
  await expect(
    panel(page).getByText("This device: Not enabled", { exact: true }),
  ).toBeVisible();
  expect((await state(page)).subscribed).toBe(false);
  expect(
    calls.filter(
      (c) => c.method === "POST" && c.path === "/push/subscriptions",
    ),
  ).toHaveLength(1);
});
for (const theme of ["light", "dark"])
  test(`push controls are accessible on mobile in ${theme} theme`, async ({
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
      panel(page).getByText("This device: Not enabled", { exact: true }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await panel(page).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`push-${theme}.png`),
    });
  });
test("real push worker installs without requesting permission or subscribing", async ({
  page,
}) => {
  await page.goto("/login");
  const result = await page.evaluate(async () => {
    const before = Notification.permission;
    const reg = await navigator.serviceWorker.register("/push-worker.js", {
      scope: "/",
      updateViaCache: "none",
    });
    await navigator.serviceWorker.ready;
    const active = reg.active?.scriptURL;
    const subscribed = !!(await reg.pushManager.getSubscription());
    const cacheNames = await caches.keys();
    await reg.unregister();
    return {
      before,
      after: Notification.permission,
      active,
      subscribed,
      cacheNames,
    };
  });
  expect(result.after).toBe(result.before);
  expect(result.active).toContain("/push-worker.js");
  expect(result.subscribed).toBe(false);
  expect(result.cacheNames).toEqual([]);
});
test("manifest, icons and worker are served with no-store and no offline interception", async ({
  request,
}) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({
    start_url: "/notifications",
    display: "standalone",
    scope: "/",
  });
  for (const size of [192, 512]) {
    const icon = await request.get(`/brand/push-${size}.png`);
    expect(icon.headers()["content-type"]).toContain("image/png");
  }
  const worker = await request.get("/push-worker.js");
  expect(worker.headers()["cache-control"]).toContain("no-store");
  expect(worker.headers()["service-worker-allowed"]).toBe("/");
  expect(await worker.text()).not.toContain('addEventListener("fetch"');
});
