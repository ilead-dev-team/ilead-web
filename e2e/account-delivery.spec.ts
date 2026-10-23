import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  staff,
  invite,
  invitee,
  mailbox,
  recovery,
  delivery,
  meta,
} from "../tests/fixtures/account-delivery";
import type { RecoveryRequest } from "../src/lib/account-delivery";
import type { User } from "../src/lib/account";
const token = "q".repeat(43),
  invitePath = `/invitations/by-token/${token}`;
async function setup(page: Page, role: User["role"] = "COORDINATOR") {
  const calls: { path: string; method: string; body: unknown; key?: string }[] =
    [];
  const state = {
    user: { ...staff, role } as User,
    mailbox: { ...mailbox },
    rows: [structuredClone(recovery)] as RecoveryRequest[],
  };
  // No real OAuth/provider navigation is allowed in these explicit substitutes.
  await page.route("https://**/*", (route) => route.abort());
  await page.route("**/api/v1/**", (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace("/api/v1", "");
    calls.push({
      path,
      method: req.method(),
      body: req.postData() ? req.postDataJSON() : null,
      key: req.headers()["idempotency-key"],
    });
    if (path === "/auth/me")
      return route.fulfill({ json: { data: state.user } });
    if (path === invitePath) return route.fulfill({ json: { data: invite } });
    if (path === `${invitePath}/accept`) {
      state.user = { ...invitee };
      return route.fulfill({
        json: {
          data: {
            user: { id: invitee.id, email: invitee.email, role: invitee.role },
          },
        },
      });
    }
    if (path === "/mailbox" && req.method() === "GET")
      return route.fulfill({ json: { data: state.mailbox } });
    if (path === "/mailbox" && req.method() === "DELETE") {
      state.mailbox.connected = false;
      return route.fulfill({
        status: 204,
        headers: { "X-Mailbox-Revocation": "unconfirmed" },
      });
    }
    if (path === "/mailbox/callback")
      return route.fulfill({ json: { data: mailbox } });
    if (path === "/mailbox/connect")
      return route.fulfill({
        json: {
          data: {
            authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?state=${token}`,
          },
        },
      });
    if (path === "/account-recovery")
      return route.fulfill({ json: { data: state.rows, meta } });
    if (path === `/account-recovery/${recovery.id}`)
      return route.fulfill({
        json: {
          data: { ...state.rows[0], mailboxConnected: state.mailbox.connected },
        },
      });
    if (path === `/account-recovery/${recovery.id}/send-reset`) {
      state.rows = [
        {
          ...recovery,
          status: "ISSUED",
          issuedAt: "2026-10-20T09:00:00Z",
          deliveries: [delivery],
        },
      ];
      return route.fulfill({
        status: 202,
        json: { data: { deliveryStatus: "PENDING" } },
      });
    }
    if (path === "/notifications/unread-count")
      return route.fulfill({ json: { data: { count: 0 } } });
    if (path === "/push/subscriptions")
      return route.fulfill({ json: { data: [] } });
    return route.fulfill({
      status: 404,
      json: {
        error: { code: "NOT_FOUND", message: "Fixture endpoint unavailable" },
      },
    });
  });
  return { calls, state };
}
async function fillInvitation(page: Page) {
  await page.getByLabel("Full name").fill("Invitee");
  await page.getByLabel("Class", { exact: true }).selectOption("YEAR_2");
  await page.getByLabel("Password", { exact: true }).fill("Password123");
  await page.getByLabel("Confirm password").fill("Password123");
}

test("recovery notification survives expired-session sign-in", async ({
  page,
}) => {
  const { calls } = await setup(page);
  let signedIn = false;
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill(
      signedIn
        ? { json: { data: staff } }
        : { status: 401, json: { error: { code: "UNAUTHORIZED" } } },
    ),
  );
  await page.route("**/api/v1/auth/refresh", (route) =>
    route.fulfill({ status: 401, json: { error: { code: "UNAUTHORIZED" } } }),
  );
  await page.route("**/api/v1/auth/login", (route) => {
    signedIn = true;
    return route.fulfill({ status: 204 });
  });
  await page.goto(`/people/recovery?request=${recovery.id}`);
  await expect(page).toHaveURL(
    `/login?next=${encodeURIComponent(`/people/recovery?request=${recovery.id}`)}`,
  );
  expect(calls.some((c) => c.path.startsWith("/account-recovery"))).toBe(false);
  await page.getByLabel("Email address").fill(staff.email);
  await page.getByLabel("Password", { exact: true }).fill("Password123");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(`/people/recovery?request=${recovery.id}`);
  await expect(
    page.getByRole("heading", { name: "Request details" }),
  ).toBeVisible();
});

test("recovery notification opens exact request and refreshes after reviewed send", async ({
  page,
}) => {
  const { calls } = await setup(page);
  await page.goto(`/people/recovery?request=${recovery.id}`);
  await expect(
    page.getByRole("heading", { name: "Request details" }),
  ).toBeVisible();
  await expect(page.getByText("No delivery attempts.")).toBeVisible();
  await page
    .getByRole("button", { name: "Send reset email to Invitee" })
    .click();
  await page.getByRole("button", { name: "Confirm send", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Send reset email?" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("region", { name: "Recovery request details" }),
  ).toContainText("Attempts: 0");
  expect(calls.filter((c) => c.path.endsWith("/send-reset"))).toHaveLength(1);
  expect(calls.some((c) => c.path === "/account-recovery")).toBe(false);
  await page.getByRole("link", { name: "Back to recovery queue" }).click();
  await expect(page.getByRole("link", { name: "View request" })).toBeVisible();
});

test("recovery rejects invalid notification identifiers without requesting recovery data", async ({
  page,
}) => {
  const { calls } = await setup(page);
  for (const query of [
    "request=invalid",
    `request=${recovery.id}&request=${recovery.id}`,
  ]) {
    await page.goto(`/people/recovery?${query}`);
    await expect(page.getByText(/This recovery link is invalid/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send reset email to Invitee" }),
    ).toHaveCount(0);
  }
  expect(calls.some((c) => c.path.startsWith("/account-recovery"))).toBe(false);
});

test("recovery missing target offers queue escape and explicit retry", async ({
  page,
}) => {
  await setup(page);
  await page.goto(`/people/recovery?request=${invitee.id}`);
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to recovery queue" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Request details" }),
  ).not.toBeVisible();
});

test("recovery detail blocks sending while account email is unavailable", async ({
  page,
}) => {
  const { state, calls } = await setup(page);
  state.mailbox.connected = false;
  await page.goto(`/people/recovery?request=${recovery.id}`);
  await expect(
    page.getByRole("link", { name: "Open email settings" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send reset email to Invitee" }),
  ).toBeDisabled();
  state.mailbox.connected = true;
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(
    page.getByRole("button", { name: "Send reset email to Invitee" }),
  ).toBeEnabled();
  expect(calls.some((c) => c.path.endsWith("/send-reset"))).toBe(false);
});
const submitInvite = (page: Page) =>
  page.getByRole("button", { name: "Accept invitation", exact: true });
test("invitation known rejection retains values and focus changes do not erase the form", async ({
  page,
}) => {
  const f = await setup(page);
  let attempts = 0;
  await page.route(`**/api/v1${invitePath}/accept`, (route) => {
    attempts++;
    return route.fulfill({
      status: 400,
      json: {
        error: { code: "VALIDATION_ERROR", message: "Please check your name" },
      },
    });
  });
  await page.goto(`/invite/${token}`);
  await fillInvitation(page);
  await submitInvite(page).click();
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toContainText("check your name");
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true })),
  );
  await expect(page.getByLabel("Full name")).toHaveValue("Invitee");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
    "Password123",
  );
  expect(f.calls.filter((c) => c.path === invitePath)).toHaveLength(1);
  expect(attempts).toBe(1);
});
for (const mode of ["network", "malformed", "wrong-account"] as const)
  test(`invitation ${mode} outcome blocks another acceptance and exposes read-only sign-in checking`, async ({
    page,
  }) => {
    const f = await setup(page);
    let attempts = 0;
    await page.route(`**/api/v1${invitePath}/accept`, (route) => {
      attempts++;
      f.state.user = { ...invitee };
      return mode === "network"
        ? route.abort("failed")
        : route.fulfill({
            json:
              mode === "malformed"
                ? { data: { ok: true } }
                : { data: { user: staff } },
          });
    });
    await page.goto(`/invite/${token}`);
    await fillInvitation(page);
    await submitInvite(page).click();
    await expect(
      page.getByRole("heading", { name: "Account creation not confirmed." }),
    ).toBeVisible();
    await expect(submitInvite(page)).toHaveCount(0);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await page
      .getByRole("button", { name: "Check sign-in", exact: true })
      .click();
    await expect(page).toHaveURL(/\/register-roundtable$/);
    expect(attempts).toBe(1);
  });
test("accepted invitation with failed session read retries only the read", async ({
  page,
}) => {
  const f = await setup(page);
  let fail = true;
  await page.route("**/api/v1/auth/me", (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
        })
      : route.fulfill({ json: { data: invitee } }),
  );
  await page.goto(`/invite/${token}`);
  await fillInvitation(page);
  await submitInvite(page).click();
  await expect(
    page.getByRole("heading", { name: "Account created." }),
  ).toBeVisible();
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toBeVisible();
  expect(f.calls.filter((c) => c.path === `${invitePath}/accept`)).toHaveLength(
    1,
  );
  fail = false;
  await page
    .getByRole("button", { name: "Open workspace", exact: true })
    .click();
  await expect(page).toHaveURL(/\/register-roundtable$/);
  expect(f.calls.filter((c) => c.path === `${invitePath}/accept`)).toHaveLength(
    1,
  );
});
test("invitation lookup failures distinguish temporary unavailability and recover", async ({
  page,
}) => {
  await setup(page);
  let fail = true;
  await page.route(`**/api/v1${invitePath}`, (route) =>
    route.fulfill(
      fail
        ? {
            status: 503,
            json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
          }
        : { json: { data: invite } },
    ),
  );
  await page.goto(`/invite/${token}`);
  await expect(
    page.getByRole("heading", { name: "Could not check invitation." }),
  ).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByLabel("Full name")).toBeVisible();
});
test("pending invitation disables editing and duplicate acceptance", async ({
  page,
}) => {
  await setup(page);
  let release!: () => void,
    attempts = 0;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/v1${invitePath}/accept`, async (route) => {
    attempts++;
    await hold;
    await route.fulfill({
      status: 400,
      json: { error: { code: "VALIDATION_ERROR", message: "Check values" } },
    });
  });
  await page.goto(`/invite/${token}`);
  await fillInvitation(page);
  await submitInvite(page).click();
  await expect(submitInvite(page)).toBeDisabled();
  await expect(page.getByLabel("Full name")).toBeDisabled();
  release();
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toContainText("Check values");
  expect(attempts).toBe(1);
});
test("mailbox malformed status never renders connection controls and valid refresh recovers", async ({
  page,
}) => {
  await setup(page);
  let malformed = true;
  await page.route("**/api/v1/mailbox", (route) =>
    route.fulfill({
      json: { data: malformed ? { ...mailbox, connected: "true" } : mailbox },
    }),
  );
  await page.goto("/mailbox");
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toContainText("could not be verified");
  await expect(
    page.getByRole("button", { name: "Disconnect mailbox", exact: true }),
  ).toHaveCount(0);
  malformed = false;
  await page.getByRole("button", { name: "Refresh mailbox" }).click();
  await expect(
    page.getByRole("button", { name: "Disconnect mailbox", exact: true }),
  ).toBeVisible();
});
test("disconnect requires review, blocks pending dismissal and reports unknown provider revocation conservatively", async ({
  page,
}) => {
  const f = await setup(page);
  let release!: () => void,
    attempts = 0;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/mailbox", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { data: f.state.mailbox } });
    attempts++;
    await hold;
    f.state.mailbox.connected = false;
    return route.fulfill({
      status: 204,
      headers: { "X-Mailbox-Revocation": "unexpected" },
    });
  });
  await page.goto("/mailbox");
  await page
    .getByRole("button", { name: "Disconnect mailbox", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Disconnect mailbox?",
    exact: true,
  });
  await expect(dialog).toContainText(mailbox.address);
  expect(attempts).toBe(0);
  await dialog.getByRole("button", { name: "Confirm disconnect" }).click();
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "could not be confirmed",
  );
  await expect(
    page.getByRole("button", { name: "Refresh mailbox" }),
  ).toBeFocused();
  expect(attempts).toBe(1);
});
test("unconfirmed mailbox disconnect blocks repeat deletion until explicit status refresh", async ({
  page,
}) => {
  const f = await setup(page);
  let attempts = 0;
  await page.route("**/api/v1/mailbox", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { data: f.state.mailbox } });
    attempts++;
    f.state.mailbox.connected = false;
    return route.fulfill({ json: { data: { ok: true } } });
  });
  await page.goto("/mailbox");
  await page
    .getByRole("button", { name: "Disconnect mailbox", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Disconnect mailbox?",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Confirm disconnect" }).click();
  await expect(
    dialog.getByRole("button", { name: "Confirm disconnect" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Close review" }).click();
  await expect(
    page.getByRole("button", { name: "Disconnect mailbox", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Refresh mailbox" }).click();
  await expect(
    page.getByRole("button", { name: "Connect Gmail", exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(1);
});
test("OAuth callback scrubs credentials, validates acknowledgement and never replays its 401", async ({
  page,
}) => {
  const f = await setup(page);
  let attempts = 0;
  await page.route("**/api/v1/mailbox/callback", (route) => {
    attempts++;
    return route.fulfill({
      status: 401,
      json: {
        error: { code: "MAILBOX_SESSION_REQUIRED", message: "Sign in again" },
      },
    });
  });
  await page.goto(`/mailbox/callback?state=${token}&code=provider-secret`);
  await expect(page).toHaveURL(/\/mailbox\/callback$/);
  await expect(
    page.getByRole("heading", { name: "Mailbox connection not confirmed." }),
  ).toBeVisible();
  expect(attempts).toBe(1);
  expect(f.calls.some((c) => c.path === "/auth/refresh")).toBe(false);
});
test("OAuth malformed success and invalid query cannot produce connected success", async ({
  page,
}) => {
  await setup(page);
  let attempts = 0;
  await page.route("**/api/v1/mailbox/callback", (route) => {
    attempts++;
    return route.fulfill({ json: { data: { ...mailbox, connected: false } } });
  });
  await page.goto(`/mailbox/callback?state=${token}&code=x`);
  await expect(
    page.getByRole("heading", { name: "Mailbox connection not confirmed." }),
  ).toBeVisible();
  expect(attempts).toBe(1);
  await page.goto(`/mailbox/callback?state=bad&code=x`);
  await expect(page).toHaveURL(/\/mailbox\/callback$/);
  await expect(
    page.getByRole("heading", { name: "Mailbox connection not confirmed." }),
  ).toBeVisible();
  expect(attempts).toBe(1);
});
test("valid OAuth return confirms only the verified mailbox summary", async ({
  page,
}) => {
  const f = await setup(page);
  await page.goto(`/mailbox/callback?state=${token}&code=provider-secret`);
  await expect(
    page.getByRole("heading", { name: "Mailbox connected." }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(mailbox.address);
  expect(f.calls.find((c) => c.path === "/mailbox/callback")?.body).toEqual({
    state: token,
    code: "provider-secret",
  });
});
test("unsafe OAuth navigation is rejected before leaving the app", async ({
  page,
}) => {
  const f = await setup(page);
  f.state.mailbox.connected = false;
  await page.route("**/api/v1/mailbox/connect", (route) =>
    route.fulfill({
      json: {
        data: { authorizationUrl: "https://accounts.google.com/unsafe-path" },
      },
    }),
  );
  await page.goto("/mailbox");
  await page
    .getByRole("button", { name: "Connect Gmail", exact: true })
    .click();
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toContainText("could not be verified");
  await expect(page).toHaveURL(/\/mailbox$/);
});
test("recovery review sends no recipient override, retains one idempotency key through an unconfirmed result and then disables the active request", async ({
  page,
}) => {
  const f = await setup(page);
  await page.clock.setFixedTime(new Date("2026-10-20T09:00:00Z"));
  const keys: string[] = [];
  let attempts = 0;
  await page.route(
    `**/api/v1/account-recovery/${recovery.id}/send-reset`,
    (route) => {
      attempts++;
      keys.push(route.request().headers()["idempotency-key"]!);
      expect(route.request().postDataJSON()).toEqual({});
      if (attempts === 1)
        return route.fulfill({
          json: { data: { deliveryStatus: "DELIVERED" } },
        });
      f.state.rows = [
        {
          ...recovery,
          status: "ISSUED",
          issuedAt: "2026-10-20T09:00:00Z",
          deliveries: [delivery],
        },
      ];
      return route.fulfill({
        status: 202,
        json: { data: { deliveryStatus: "PENDING" } },
      });
    },
  );
  await page.goto("/people/recovery");
  await page
    .getByRole("button", { name: "Send reset email to Invitee", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Send reset email?",
    exact: true,
  });
  await expect(dialog).toContainText(invite.email);
  expect(attempts).toBe(0);
  await dialog.getByRole("button", { name: "Confirm send" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("button", { name: "Retry same request" }).click();
  await expect(dialog).not.toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByRole("status")).toContainText("queued");
  await expect(
    page.getByRole("button", {
      name: "Send reset email to Invitee",
      exact: true,
    }),
  ).toBeDisabled();
});
test("confirmed failed delivery allows a new reviewed attempt with a new key", async ({
  page,
}) => {
  await setup(page);
  const keys: string[] = [];
  await page.route(
    `**/api/v1/account-recovery/${recovery.id}/send-reset`,
    (route) => {
      keys.push(route.request().headers()["idempotency-key"]!);
      return route.fulfill({
        status: 202,
        json: {
          data: { deliveryStatus: keys.length === 1 ? "FAILED" : "ACCEPTED" },
        },
      });
    },
  );
  await page.goto("/people/recovery");
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole("button", { name: "Send reset email to Invitee", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm send" })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  expect(keys[0]).not.toBe(keys[1]);
  await expect(page.getByRole("status")).toContainText(
    "does not confirm inbox delivery",
  );
});
test("recovery pending send blocks dismissal, duplicate writes and paging", async ({
  page,
}) => {
  await setup(page);
  let release!: () => void,
    attempts = 0;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    `**/api/v1/account-recovery/${recovery.id}/send-reset`,
    async (route) => {
      attempts++;
      await hold;
      await route.fulfill({
        status: 202,
        json: { data: { deliveryStatus: "ACCEPTED" } },
      });
    },
  );
  await page.goto("/people/recovery");
  await page
    .getByRole("button", { name: "Send reset email to Invitee", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Send reset email?",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Confirm send" }).click();
  await expect(dialog.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh status" }),
  ).toBeDisabled();
  release();
  await expect(dialog).not.toBeVisible();
  expect(attempts).toBe(1);
});
test("malformed recovery rows fail closed and failed page navigation keeps Previous usable", async ({
  page,
}) => {
  await setup(page);
  let invalid = true;
  await page.route("**/api/v1/account-recovery?**", (route) => {
    const n = Number(new URL(route.request().url()).searchParams.get("page"));
    return n === 2
      ? route.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
        })
      : route.fulfill({
          json: {
            data: invalid
              ? [{ ...recovery, status: "UNKNOWN" }]
              : Array.from({ length: 20 }, (_, i) => ({
                  ...recovery,
                  id:
                    i === 0
                      ? recovery.id
                      : `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`,
                  user: {
                    ...recovery.user,
                    name: i === 0 ? "Invitee" : `Invitee ${i}`,
                  },
                })),
            meta: { ...meta, total: 21, totalPages: 2 },
          },
        });
  });
  await page.goto("/people/recovery");
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Send reset email to Invitee",
      exact: true,
    }),
  ).toHaveCount(0);
  invalid = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Send reset email to Invitee",
      exact: true,
    }),
  ).toBeVisible();
});
for (const role of ["SPONSOR", "FACILITATOR"] as const)
  test(`${role} cannot load recovery accounts or invoke sending`, async ({
    page,
  }) => {
    const f = await setup(page, role);
    await page.goto("/people/recovery");
    await expect(page).toHaveURL(
      role === "SPONSOR" ? /\/dashboard$/ : /\/register-roundtable$/,
    );
    expect(f.calls.some((c) => c.path.startsWith("/account-recovery"))).toBe(
      false,
    );
  });
test("mailbox cache is isolated when the current account changes within one tab", async ({
  page,
}) => {
  const f = await setup(page);
  await page.clock.setFixedTime(new Date("2026-10-20T09:00:00Z"));
  await page.goto("/mailbox");
  await expect(
    page.getByText(`Connected: ${mailbox.address}`, { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "People", exact: true }).click();
  await expect(page).toHaveURL(/\/people$/);
  f.state.user = {
    ...staff,
    id: invitee.id,
    name: "Second Coordinator",
    email: "second@example.test",
  };
  f.state.mailbox.address = "second-sender@example.test";
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true })),
  );
  await expect(page.getByRole("banner")).toContainText("Second Coordinator");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Program email", exact: true })
    .click();
  await expect(
    page.getByText("Connected: second-sender@example.test", { exact: true }),
  ).toBeVisible();
  expect(
    f.calls.filter((c) => c.path === "/mailbox" && c.method === "GET"),
  ).toHaveLength(2);
});
for (const area of ["mailbox", "recovery"] as const)
  test(`${area} write is refused after an unnoticed account switch`, async ({
    page,
  }) => {
    const f = await setup(page);
    await page.goto(area === "mailbox" ? "/mailbox" : "/people/recovery");
    await page
      .getByRole("button", {
        name:
          area === "mailbox"
            ? "Disconnect mailbox"
            : "Send reset email to Invitee",
        exact: true,
      })
      .click();
    f.state.user = { ...staff, id: invitee.id };
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", {
        name: area === "mailbox" ? "Confirm disconnect" : "Confirm send",
        exact: true,
      })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Your sign-in changed",
    );
    expect(
      f.calls.filter(
        (c) => c.method === "DELETE" || c.path.endsWith("/send-reset"),
      ),
    ).toHaveLength(0);
  });
for (const role of ["SPONSOR", "COORDINATOR"] as const)
  test(`${role} invitation uses the locked role and correct class requirement`, async ({
    page,
  }) => {
    const f = await setup(page);
    await page.route(`**/api/v1${invitePath}`, (route) =>
      route.fulfill({ json: { data: { ...invite, role } } }),
    );
    let body: unknown;
    await page.route(`**/api/v1${invitePath}/accept`, (route) => {
      body = route.request().postDataJSON();
      f.state.user = {
        ...invitee,
        role,
        classYear: role === "SPONSOR" ? null : "YEAR_2",
      };
      return route.fulfill({
        json: { data: { user: { id: invitee.id, email: invite.email, role } } },
      });
    });
    await page.goto(`/invite/${token}`);
    await page.getByLabel("Full name").fill("Invitee");
    await page.getByLabel("Password", { exact: true }).fill("Password123");
    await page.getByLabel("Confirm password").fill("Password123");
    if (role === "COORDINATOR") {
      await submitInvite(page).click();
      await expect(page.getByLabel("Class", { exact: true })).toBeFocused();
      await page.getByLabel("Class", { exact: true }).selectOption("YEAR_2");
    } else
      await expect(page.getByLabel("Class", { exact: true })).toHaveCount(0);
    await submitInvite(page).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(body).toEqual({
      name: "Invitee",
      password: "Password123",
      ...(role === "COORDINATOR" ? { classYear: "YEAR_2" } : {}),
    });
  });
test("recovery refuses a mismatched detail response before enabling sending", async ({
  page,
}) => {
  await setup(page);
  await page.route(`**/api/v1/account-recovery/${recovery.id}`, (route) =>
    route.fulfill({
      json: { data: { ...recovery, id: invitee.id, mailboxConnected: true } },
    }),
  );
  await page.goto(`/people/recovery?request=${recovery.id}`);
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send reset email to Invitee" }),
  ).toHaveCount(0);
});

for (const theme of ["light", "dark"])
  test(`recovery detail history supports narrow layouts in ${theme} theme`, async ({
    page,
  }) => {
    const { state } = await setup(page);
    state.rows = [
      {
        ...recovery,
        status: "RESOLVED",
        resolvedAt: "2026-10-20T09:30:00Z",
        deliveries: [
          {
            ...delivery,
            status: "FAILED",
            attempts: 2,
            lastErrorCode: "PROVIDER_UNAVAILABLE",
          },
          {
            ...delivery,
            id: invitee.id,
            status: "ACCEPTED",
            acceptedAt: "2026-10-20T09:05:00Z",
          },
        ],
      },
    ];
    await page.setViewportSize({ width: 320, height: 740 });
    await page.addInitScript(
      (theme) => localStorage.setItem("ilead-theme", theme),
      theme,
    );
    await page.goto(`/people/recovery?request=${recovery.id}`);
    const details = page.getByRole("region", {
      name: "Recovery request details",
    });
    await expect(details.getByRole("listitem")).toHaveCount(2);
    await expect(details).toContainText("PROVIDER_UNAVAILABLE");
    await expect(details).toContainText("Provider accepted");
    await expect(
      page.getByRole("button", { name: "Send reset email to Invitee" }),
    ).toBeDisabled();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/recovery-detail-${theme}.png`,
      fullPage: true,
    });
  });

for (const theme of ["light", "dark"])
  test(`invitation, mailbox and recovery reviews support narrow keyboard layouts in ${theme} theme`, async ({
    page,
  }) => {
    await setup(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.addInitScript(
      (theme) => localStorage.setItem("ilead-theme", theme),
      theme,
    );
    await page.goto(`/invite/${token}`);
    await expect(page.getByLabel("Full name")).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/invitation-qualified-${theme}.png`,
      fullPage: true,
    });
    await page.goto("/mailbox");
    await page
      .getByRole("button", { name: "Disconnect mailbox", exact: true })
      .click();
    const mailboxDialog = page.getByRole("dialog", {
      name: "Disconnect mailbox?",
      exact: true,
    });
    await expect(
      mailboxDialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      mailboxDialog.getByRole("button", { name: "Confirm disconnect" }),
    ).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `test-results/mailbox-qualified-${theme}.png`,
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Refresh mailbox" }),
    ).toBeFocused();
    await page.goto("/people/recovery");
    await expect(
      page.getByRole("button", {
        name: "Send reset email to Invitee",
        exact: true,
      }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Send reset email to Invitee", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Send reset email?",
      exact: true,
    });
    await expect(dialog).toContainText(invite.email);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `test-results/recovery-qualified-${theme}.png`,
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", {
        name: "Send reset email to Invitee",
        exact: true,
      }),
    ).toBeFocused();
  });

for (const theme of ["light", "dark"] as const)
  for (const connected of [true, false]) {
    test(`shared program email ${connected ? "configured" : "disabled"} in ${theme} never offers personal OAuth controls`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript(
        (value) => localStorage.setItem("ilead-theme", value),
        theme,
      );
      await setup(page);
      await page.route("**/api/v1/mailbox", (route) =>
        route.fulfill({
          json: {
            data: {
              connected,
              provider: "brevo",
              scope: "PROGRAM",
              address: connected ? "ilead@program.example.test" : null,
              reconnectRequired: false,
            },
          },
        }),
      );
      await page.goto("/mailbox");
      await expect(page.locator("html")).toHaveClass(
        theme === "dark" ? /dark/ : /^(?!.*\bdark\b).*$/,
      );
      await expect(
        page.getByRole("heading", { name: "Program email", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Program email status" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Connect Gmail", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Disconnect mailbox", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("Configuration is not proof of delivery.", {
          exact: false,
        }),
      ).toBeVisible();
      if (connected)
        await expect(
          page.getByText("Sending configured: ilead@program.example.test"),
        ).toBeVisible();
      else
        await expect(
          page.getByText(
            "Program email is not configured or sending is disabled.",
          ),
        ).toBeVisible();
      await page
        .getByRole("button", { name: "Refresh mailbox", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Program email", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("program-email.png"),
        fullPage: true,
      });
    });
  }
