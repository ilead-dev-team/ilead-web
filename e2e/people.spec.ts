import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ids, invitation, inviteAck, person } from "../tests/fixtures/people";
async function setup(page: Page, role = "COORDINATOR") {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({
      json: {
        data: {
          id: ids.person,
          name: "Coordinator",
          email: "staff@example.test",
          role,
          classYear: null,
          hasRoundtable: false,
          roundtableId: null,
        },
      },
    }),
  );
  await page.route("**/api/v1/users**", (r) => {
    const url = new URL(r.request().url()),
      selected = url.searchParams.get("role") ?? "FACILITATOR";
    return r.fulfill({
      json: {
        data: [
          {
            ...person,
            role: selected,
            ...(selected !== "FACILITATOR" ? { hasRoundtable: undefined } : {}),
          },
        ],
        meta: {
          page: Number(url.searchParams.get("page")),
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      },
    });
  });
  await page.route("**/api/v1/mailbox", (r) =>
    r.fulfill({
      json: {
        data: {
          connected: false,
          address: null,
          provider: null,
          reconnectRequired: false,
        },
      },
    }),
  );
  await page.route("**/api/v1/invitations?**", (r) => {
    const url = new URL(r.request().url());
    return r.fulfill({
      json: {
        data:
          !url.searchParams.get("status") ||
          url.searchParams.get("status") === "PENDING"
            ? [invitation]
            : [],
        meta: {
          page: Number(url.searchParams.get("page")),
          pageSize: 20,
          total:
            !url.searchParams.get("status") ||
            url.searchParams.get("status") === "PENDING"
              ? 1
              : 0,
          totalPages:
            !url.searchParams.get("status") ||
            url.searchParams.get("status") === "PENDING"
              ? 1
              : 0,
        },
      },
    });
  });
}
const alert = (page: Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)');
async function invitations(page: Page) {
  await page.getByRole("button", { name: "Invitations", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Invitations table", exact: true }),
  ).toBeVisible();
}
test("people role views, search, pagination and unregistered selection use exact API filters", async ({
  page,
}) => {
  await setup(page);
  const calls: URL[] = [];
  await page.route("**/api/v1/users**", (r) => {
    const url = new URL(r.request().url());
    calls.push(url);
    const role = url.searchParams.get("role") ?? "FACILITATOR";
    return r.fulfill({
      json: {
        data: [
          {
            ...person,
            role,
            ...(role !== "FACILITATOR" ? { hasRoundtable: undefined } : {}),
          },
        ],
        meta: {
          page: Number(url.searchParams.get("page")),
          pageSize: 20,
          total: 21,
          totalPages: 2,
        },
      },
    });
  });
  await page.goto("/people");
  await expect(
    page.getByRole("cell", { name: "Ada Example ada@example.test" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await page.getByLabel("Search name or email").fill(" Ada ");
  await page
    .getByRole("button", { name: "Search people", exact: true })
    .click();
  await expect.poll(() => calls.at(-1)?.searchParams.get("q")).toBe("Ada");
  expect(calls.at(-1)?.searchParams.get("page")).toBe("1");
  await page.getByRole("button", { name: "Sponsors", exact: true }).click();
  await expect
    .poll(() => calls.at(-1)?.searchParams.get("role"))
    .toBe("SPONSOR");
  expect(calls.at(-1)?.searchParams.get("pageSize")).toBe("20");
  await page.getByRole("button", { name: "Coordinators", exact: true }).click();
  await expect
    .poll(() => calls.at(-1)?.searchParams.get("role"))
    .toBe("COORDINATOR");
  await page.getByRole("button", { name: "Unregistered", exact: true }).click();
  await expect
    .poll(() => calls.at(-1)?.pathname)
    .toBe("/api/v1/users/unregistered-facilitators");
  expect(calls.at(-1)?.searchParams.has("role")).toBe(false);
  expect(calls.at(-1)?.searchParams.has("q")).toBe(false);
  await expect(page.getByLabel("Search name or email")).toHaveCount(0);
});
test("people fetch errors retain search, retry and empty data without invented users", async ({
  page,
}) => {
  await setup(page);
  let fail = true;
  await page.route("**/api/v1/users**", (r) =>
    r.fulfill(
      fail
        ? { status: 503, json: { error: { code: "UNAVAILABLE" } } }
        : {
            json: {
              data: [],
              meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
            },
          },
    ),
  );
  await page.goto("/people");
  await expect(
    page.getByRole("button", { name: "Retry people" }),
  ).toBeVisible();
  await page.getByLabel("Search name or email").fill("Nobody");
  await page
    .getByRole("button", { name: "Search people", exact: true })
    .click();
  await expect(page.getByLabel("Search name or email")).toHaveValue("Nobody");
  fail = false;
  await page.getByRole("button", { name: "Retry people" }).click();
  await expect(
    page.getByText("No people match this search on this page."),
  ).toBeVisible();
});
test("new invitation validates, reviews the granted role, preserves rejected input and distinguishes failed email from stored invitation", async ({
  page,
}) => {
  await setup(page);
  let fail = true;
  const bodies: unknown[] = [];
  await page.route("**/api/v1/invitations", async (r) => {
    bodies.push(r.request().postDataJSON());
    return r.fulfill(
      fail
        ? {
            status: 409,
            json: {
              error: {
                code: "INVITATION_EXISTS",
                message: "A pending invitation already exists.",
              },
            },
          }
        : {
            status: 201,
            json: {
              data: {
                ...inviteAck(),
                email: "new@example.test",
                role: "SPONSOR",
              },
            },
          },
    );
  });
  await page.goto("/people");
  await invitations(page);
  await page.getByRole("button", { name: "Invite user", exact: true }).click();
  await page.getByLabel("Email address", { exact: true }).fill("bad");
  await page
    .getByRole("button", { name: "Review invitation", exact: true })
    .click();
  await expect(alert(page)).toContainText("valid email");
  expect(bodies).toHaveLength(0);
  await page
    .getByLabel("Email address", { exact: true })
    .fill(" New@Example.test ");
  await page.getByLabel("Invitation role").selectOption("SPONSOR");
  await page
    .getByRole("button", { name: "Review invitation", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Review new invitation" });
  await expect(dialog).toContainText("Sponsor");
  expect(bodies).toHaveLength(0);
  await dialog
    .getByRole("button", { name: "Create and email invitation", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("already exists");
  await dialog
    .getByRole("button", { name: "Cancel review", exact: true })
    .click();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
    "New@Example.test",
  );
  fail = false;
  await page
    .getByRole("button", { name: "Review invitation", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Create and email invitation", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Invitation stored for new@example.test" }),
  ).toContainText("email could not be sent");
  await expect(
    page.getByRole("button", { name: "Invite user", exact: true }),
  ).toBeFocused();
  expect(bodies.at(-1)).toEqual({ email: "new@example.test", role: "SPONSOR" });
  await expect(page.getByText(/No mailbox connected/)).toBeVisible();
});
test("resend requires review, sends no recipient override and shows queued/provider acceptance without claiming inbox delivery", async ({
  page,
}) => {
  await setup(page);
  const bodies: unknown[] = [];
  let status = "PENDING";
  await page.route(`**/api/v1/invitations/${ids.invitation}/resend`, (r) => {
    bodies.push(r.request().postDataJSON());
    return r.fulfill({
      json: {
        data: { ...inviteAck(), deliveryStatus: status, deliveryError: null },
      },
    });
  });
  await page.goto("/people");
  await invitations(page);
  await page
    .getByRole("button", {
      name: `Resend invitation to ${invitation.email}`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "Review invitation resend" });
  await expect(dialog).toContainText("old link stops working");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(bodies).toHaveLength(0);
  await page
    .getByRole("button", {
      name: `Resend invitation to ${invitation.email}`,
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", { name: "Replace link and resend", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Invitation stored" }),
  ).toContainText("email is queued");
  expect(bodies).toEqual([{}]);
  status = "ACCEPTED";
  await page
    .getByRole("button", {
      name: `Resend invitation to ${invitation.email}`,
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", { name: "Replace link and resend", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Invitation stored" }),
  ).toContainText("Inbox delivery is not confirmed");
});
test("uncertain creation acknowledgement blocks repeat sending until the list is refreshed and inspected", async ({
  page,
}) => {
  await setup(page);
  let calls = 0;
  await page.route("**/api/v1/invitations", (r) => {
    calls++;
    return r.fulfill({
      status: 201,
      json: { data: { ...inviteAck(), email: "wrong@example.test" } },
    });
  });
  await page.goto("/people");
  await invitations(page);
  await page.getByRole("button", { name: "Invite user", exact: true }).click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("expected@example.test");
  await page
    .getByRole("button", { name: "Review invitation", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Create and email invitation", exact: true })
    .click();
  await expect(dialog.getByText(/result is unconfirmed/)).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: "Create and email invitation",
      exact: true,
    }),
  ).toBeDisabled();
  expect(calls).toBe(1);
  await expect(
    page.getByText("Invitation stored for", { exact: false }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", {
      name: "Refresh and inspect invitations",
      exact: true,
    })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
    "expected@example.test",
  );
  expect(calls).toBe(1);
});
test("revocation preserves failure intent and requires a real 204 acknowledgement", async ({
  page,
}) => {
  await setup(page);
  let mode = 0,
    calls = 0;
  await page.route(`**/api/v1/invitations/${ids.invitation}`, (r) => {
    expect(r.request().method()).toBe("DELETE");
    expect(r.request().postDataJSON()).toEqual({});
    calls++;
    return r.fulfill(
      mode === 0
        ? {
            status: 409,
            json: {
              error: {
                code: "CONFLICT",
                message: "Invitation changed. Refresh it.",
              },
            },
          }
        : mode === 1
          ? { status: 200, json: { data: {} } }
          : { status: 204 },
    );
  });
  await page.goto("/people");
  await invitations(page);
  await page
    .getByRole("button", {
      name: `Revoke invitation for ${invitation.email}`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("cannot be unsent");
  await dialog
    .getByRole("button", { name: "Revoke invitation", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Invitation changed");
  mode = 1;
  await dialog
    .getByRole("button", { name: "Revoke invitation", exact: true })
    .click();
  await expect(dialog.getByText(/result is unconfirmed/)).toBeVisible();
  await expect(page.getByText(/Invitation revoked for/)).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Refresh and inspect invitations" })
    .click();
  mode = 2;
  await page
    .getByRole("button", {
      name: `Revoke invitation for ${invitation.email}`,
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", { name: "Revoke invitation", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Invitation revoked for" }),
  ).toBeVisible();
  expect(calls).toBe(3);
});
test("invitation filters paginate, closed records have no actions, and invalid/malformed lists do not render", async ({
  page,
}) => {
  await setup(page);
  const calls: URL[] = [];
  let bad = false;
  await page.route("**/api/v1/invitations?**", (r) => {
    const url = new URL(r.request().url());
    calls.push(url);
    const status = url.searchParams.get("status") ?? "PENDING";
    return r.fulfill({
      json: {
        data: [
          {
            ...invitation,
            status,
            acceptedAt: status === "ACCEPTED" ? "2026-10-21T08:00:00Z" : null,
            revokedAt: status === "REVOKED" ? "2026-10-21T08:00:00Z" : null,
            ...(bad ? { token: "must-not-render" } : {}),
          },
        ],
        meta: {
          page: Number(url.searchParams.get("page")),
          pageSize: 20,
          total: 21,
          totalPages: 2,
        },
      },
    });
  });
  await page.goto("/people");
  await invitations(page);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await page
    .getByLabel("Invitation status", { exact: true })
    .selectOption("ACCEPTED");
  await expect(
    page.getByText("No actions available", { exact: true }),
  ).toBeVisible();
  expect(calls.at(-1)?.searchParams.get("page")).toBe("1");
  await expect(
    page.getByRole("button", { name: /Resend invitation to/ }),
  ).toHaveCount(0);
  await page
    .getByLabel("Invitation status", { exact: true })
    .selectOption("EXPIRED");
  await expect(
    page.getByRole("button", { name: /Resend invitation to/ }),
  ).toBeVisible();
  await page
    .getByLabel("Invitation status", { exact: true })
    .selectOption("REVOKED");
  await expect(
    page.getByText("No actions available", { exact: true }),
  ).toBeVisible();
  bad = true;
  await page
    .getByRole("button", { name: "Refresh invitations", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry invitations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Invitations table", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("must-not-render")).toHaveCount(0);
});
test("people and invitation review support contained mobile tables, keyboard focus and both themes", async ({
  page,
}, testInfo) => {
  await setup(page);
  await page.goto("/people");
  await expect(
    page.getByRole("region", { name: "People table" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("people-mobile-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /Switch to dark/i }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("people-mobile-dark.png"),
    fullPage: true,
  });
  await invitations(page);
  await page
    .getByRole("button", {
      name: `Resend invitation to ${invitation.email}`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("invitation-review-mobile-dark.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: `Resend invitation to ${invitation.email}`,
      exact: true,
    }),
  ).toBeFocused();
  await page.getByRole("button", { name: /Switch to light/i }).click();
  await page
    .getByRole("button", {
      name: `Resend invitation to ${invitation.email}`,
      exact: true,
    })
    .click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("invitation-review-mobile-light.png"),
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Facilitators", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "People table" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("people-desktop-light.png"),
    fullPage: true,
  });
});
test("Sponsor and Facilitator never request people, invitations or mailbox administration", async ({
  page,
}) => {
  for (const role of ["SPONSOR", "FACILITATOR"]) {
    await setup(page, role);
    let reads = 0;
    for (const path of ["users**", "invitations**", "mailbox"])
      await page.route(`**/api/v1/${path}`, (r) => {
        reads++;
        return r.fulfill({ status: 403 });
      });
    await page.route("**/api/v1/dashboard/summary**", (r) =>
      r.fulfill({
        status: 404,
        json: { error: { code: "ACADEMIC_YEAR_NOT_FOUND" } },
      }),
    );
    await page.route("**/api/v1/academic-years?**", (r) =>
      r.fulfill({
        json: {
          data: [],
          meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        },
      }),
    );
    await page.route("**/api/v1/roundtables?**", (r) =>
      r.fulfill({
        json: {
          data: [],
          meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        },
      }),
    );
    await page.route("**/api/v1/curriculum", (r) =>
      r.fulfill({ json: { data: { levels: [] } } }),
    );
    await page.goto("/people");
    await expect(page).toHaveURL(
      role === "SPONSOR" ? "/dashboard" : "/register-roundtable",
    );
    expect(reads).toBe(0);
    await expect(
      page.getByRole("link", { name: "People", exact: true }),
    ).toHaveCount(0);
  }
});
