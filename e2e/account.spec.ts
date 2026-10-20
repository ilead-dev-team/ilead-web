import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { summary } from "../tests/fixtures/dashboard";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test Coordinator",
  email: "coordinator@example.test",
  role: "COORDINATOR",
  classYear: "YEAR_2",
  hasRoundtable: false,
  roundtableId: null,
};
const token = "a".repeat(43);
test("account layouts preserve theme, support mobile and expose accessible fields", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.screenshot({
    path: "artifacts/login-desktop-light.png",
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)').first(),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/login-mobile-dark.png",
    fullPage: true,
  });
});
test("login displays server failure and keeps typed input; success routes by current role", async ({
  page,
}) => {
  let success = false;
  await page.route("**/api/v1/auth/login", (r) =>
    r.fulfill({
      status: success ? 200 : 401,
      json: success
        ? { data: { user } }
        : {
            error: {
              code: "INVALID_CREDENTIALS",
              message: "Invalid email or password",
            },
          },
    }),
  );
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: user } }),
  );
  await page.route("**/api/v1/dashboard/summary", (r) =>
    r.fulfill({
      json: {
        data: summary(),
      },
    }),
  );
  await page.goto("/login?next=https://evil.test");
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("Password123");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toContainText("Invalid email or password");
  await expect(page.getByLabel("Email address")).toHaveValue(user.email);
  success = true;
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Welcome back, Test Coordinator." }),
  ).toBeVisible();
});
test("forgot-password confirmation remains neutral and failed requests preserve the email", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/api/v1/auth/forgot-password", (r) =>
    r.fulfill({
      status: fail ? 503 : 200,
      json: fail
        ? { error: { code: "UNAVAILABLE" } }
        : { data: { message: "If the account exists" } },
    }),
  );
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill("unknown@example.test");
  await page.getByRole("button", { name: "Request password recovery" }).click();
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue(
    "unknown@example.test",
  );
  fail = false;
  await page.getByRole("button", { name: "Request password recovery" }).click();
  await expect(page.getByRole("status")).toContainText("If the account exists");
});
test("reset validates matching passwords, scrubs the URL and sends only token/password", async ({
  page,
}) => {
  let body: unknown;
  await page.route("**/api/v1/auth/reset-password", async (r) => {
    body = r.request().postDataJSON();
    await r.fulfill({ status: 204 });
  });
  await page.goto(`/reset-password?token=${token}`);
  await expect(page).toHaveURL("/reset-password");
  await page.getByLabel("New password", { exact: true }).fill("Password123");
  await page.getByLabel("Confirm new password").fill("Different123");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toContainText("do not match");
  await page.getByLabel("Confirm new password").fill("Password123");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Password reset." }),
  ).toBeVisible();
  expect(body).toEqual({ token, password: "Password123" });
});
test("invitation locks email/role, requires class and routes Facilitators to registration", async ({
  page,
}) => {
  let body: unknown;
  await page.route(`**/api/v1/invitations/by-token/${token}`, (r) =>
    r.fulfill({
      json: {
        data: {
          email: "invited@example.test",
          role: "FACILITATOR",
          expiresAt: "2026-11-01T00:00:00Z",
        },
      },
    }),
  );
  await page.route(
    `**/api/v1/invitations/by-token/${token}/accept`,
    async (r) => {
      body = r.request().postDataJSON();
      await r.fulfill({
        json: {
          data: {
            user: {
              ...user,
              email: "invited@example.test",
              role: "FACILITATOR",
            },
          },
        },
      });
    },
  );
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({
      json: {
        data: { ...user, role: "FACILITATOR", email: "invited@example.test" },
      },
    }),
  );
  await page.route("**/api/v1/curriculum", (r) =>
    r.fulfill({ json: { data: { levels: [] } } }),
  );
  await page.goto(`/invite/${token}`);
  await expect(page.getByLabel("Invited email")).toHaveAttribute(
    "readonly",
    "",
  );
  await page.getByLabel("Full name").fill("Invitee");
  await page.getByLabel("Password", { exact: true }).fill("Password123");
  await page.getByLabel("Confirm password").fill("Password123");
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toContainText("Choose your class");
  await page.getByLabel("Class", { exact: true }).selectOption("YEAR_2");
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page).toHaveURL("/register-roundtable");
  expect(body).toEqual({
    name: "Invitee",
    password: "Password123",
    classYear: "YEAR_2",
  });
});
test("unavailable invitation and malformed reset never display account forms", async ({
  page,
}) => {
  await page.route("**/api/v1/invitations/by-token/**", (r) =>
    r.fulfill({
      status: 404,
      json: {
        error: {
          code: "INVITATION_UNAVAILABLE",
          message: "Invitation unavailable",
        },
      },
    }),
  );
  await page.goto(`/invite/${token}`);
  await expect(
    page.getByRole("heading", { name: "Invitation unavailable." }),
  ).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveCount(0);
  await page.goto("/reset-password?token=invalid");
  await expect(
    page.getByRole("heading", { name: "Reset link unavailable." }),
  ).toBeVisible();
});

test("mailbox callback scrubs provider codes and attempts completion once", async ({
  page,
}) => {
  let attempts = 0,
    body: unknown;
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: user } }),
  );
  await page.route("**/api/v1/mailbox/callback", async (r) => {
    attempts++;
    body = r.request().postDataJSON();
    await r.fulfill({
      status: 400,
      json: {
        error: {
          code: "INVALID_MAILBOX_STATE",
          message: "Mailbox authorization expired.",
        },
      },
    });
  });
  await page.goto(`/mailbox/callback?state=${token}&code=test-code`);
  await expect(page).toHaveURL("/mailbox/callback");
  await expect(
    page.getByText("Start a new connection", { exact: false }),
  ).toBeVisible();
  expect(attempts).toBe(1);
  expect(body).toEqual({ state: token, code: "test-code" });
});
test("mailbox disconnect exposes unconfirmed provider revocation", async ({
  page,
}) => {
  let connected = true;
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: user } }),
  );
  await page.route("**/api/v1/mailbox", async (r) => {
    if (r.request().method() === "DELETE") {
      connected = false;
      await r.fulfill({
        status: 204,
        headers: { "X-Mailbox-Revocation": "unconfirmed" },
      });
    } else
      await r.fulfill({
        json: {
          data: {
            connected,
            provider: "gmail",
            address: "sender@example.test",
            reconnectRequired: false,
          },
        },
      });
  });
  await page.goto("/mailbox");
  await page.getByRole("button", { name: "Disconnect mailbox" }).click();
  await page
    .getByRole("button", { name: "Confirm disconnect", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Disconnect mailbox?", exact: true }),
  ).not.toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Mailbox disconnected locally." }),
  ).toContainText("could not be confirmed");
  await expect(
    page.getByRole("link", { name: "Google account connections" }),
  ).toBeVisible();
});
test("Sponsor cannot open Coordinator mailbox screens", async ({ page }) => {
  let mailboxReads = 0;
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: { ...user, role: "SPONSOR" } } }),
  );
  await page.route("**/api/v1/mailbox", (r) => {
    mailboxReads++;
    return r.fulfill({ status: 403 });
  });
  await page.route("**/api/v1/dashboard/summary", (r) =>
    r.fulfill({
      status: 404,
      json: { error: { code: "ACADEMIC_YEAR_NOT_FOUND" } },
    }),
  );
  await page.goto("/mailbox");
  await expect(page).toHaveURL("/dashboard");
  expect(mailboxReads).toBe(0);
});
test("roundtable registration uses curriculum choices and retains input after a name conflict", async ({
  page,
}) => {
  let registered = false,
    conflict = true;
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({
      json: {
        data: {
          ...user,
          role: "FACILITATOR",
          hasRoundtable: registered,
          roundtableId: registered
            ? "22222222-2222-4222-8222-222222222222"
            : null,
        },
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
              lessons: [{ id: "l", number: 1, title: "Choices" }],
            },
          ],
        },
      },
    }),
  );
  await page.route("**/api/v1/roundtables", async (r) => {
    if (conflict)
      await r.fulfill({
        status: 409,
        json: {
          error: {
            code: "ROUNDTABLE_NAME_SIMILAR",
            message: "Choose a different name.",
          },
        },
      });
    else {
      registered = true;
      await r.fulfill({ status: 201, json: { data: { id: "rt" } } });
    }
  });
  await page.route(
    "**/api/v1/roundtables/22222222-2222-4222-8222-222222222222",
    (r) =>
      r.fulfill({
        json: {
          data: {
            id: "22222222-2222-4222-8222-222222222222",
            classYear: "YEAR_1",
            completedAt: null,
            facilitator: null,
            enrolledAt: "2026-10-19T08:00:00.000Z",
            attendance: { met: 0, didNotMeet: 0, history: [] },
            name: "New name",
            slogan: "Keep growing",
            currentLevel: "ICHOOSE",
            status: "ACTIVE",
            lastLesson: null,
            nextLesson: {
              id: "l",
              level: "ICHOOSE",
              number: 1,
              title: "Choices",
            },
          },
        },
      }),
  );
  await page.route(
    "**/api/v1/roundtables/22222222-2222-4222-8222-222222222222/progress",
    (r) => r.fulfill({ json: { data: { completed: [] } } }),
  );
  await page.goto("/register-roundtable");
  await page.getByLabel("Roundtable name").fill("Pinnacles");
  await page.getByLabel("Slogan").fill("Keep growing");
  await page
    .getByRole("button", { name: "Register roundtable", exact: true })
    .click();
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toContainText("different name");
  await expect(page.getByLabel("Slogan")).toHaveValue("Keep growing");
  conflict = false;
  await page.getByLabel("Roundtable name").fill("New name");
  await page
    .getByRole("button", { name: "Register roundtable", exact: true })
    .click();
  await expect(page).toHaveURL("/my-roundtable");
  await expect(page.getByRole("heading", { name: "New name" })).toBeVisible();
});
