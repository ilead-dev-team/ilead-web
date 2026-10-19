import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test Facilitator",
  email: "facilitator@example.test",
  role: "FACILITATOR",
  classYear: "YEAR_2",
  hasRoundtable: true,
  roundtableId: "22222222-2222-4222-8222-222222222222",
};
const issue = {
  id: "33333333-3333-4333-8333-333333333333",
  category: "WRONG_LESSON",
  message: "The recorded lesson needs correction",
  status: "OPEN",
  resolutionNote: null as string | null,
  resolvedAt: null as string | null,
  createdAt: "2026-10-19T08:00:00.000Z",
  roundtable: { id: user.roundtableId, name: "Pinnacles" },
  raisedBy: { id: user.id, name: user.name },
  resolvedBy: null as { id: string; name: string } | null,
};
async function session(page: Page, role = "FACILITATOR") {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: { ...user, role } } }),
  );
}
test("Facilitator sends own issue, retains failed text and sees resolution in accessible mobile/dark layouts", async ({
  page,
}) => {
  await session(page);
  let saved = false,
    fail = true;
  const bodies: unknown[] = [];
  await page.route("**/api/v1/issues?**", (r) => {
    const status = new URL(r.request().url()).searchParams.get("status");
    const rows =
      status === "RESOLVED"
        ? [
            {
              ...issue,
              status: "RESOLVED",
              resolutionNote: "Corrected to lesson 6",
              resolvedAt: issue.createdAt,
              resolvedBy: { id: "c", name: "Coordinator" },
            },
          ]
        : saved
          ? [issue]
          : [];
    return r.fulfill({
      json: {
        data: rows,
        meta: {
          page: 1,
          pageSize: 20,
          total: rows.length,
          totalPages: rows.length ? 1 : 0,
        },
      },
    });
  });
  await page.route("**/api/v1/issues", async (r) => {
    bodies.push(r.request().postDataJSON());
    if (fail)
      return r.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "Try again later" } },
      });
    saved = true;
    return r.fulfill({ status: 201, json: { data: issue } });
  });
  await page.goto("/issues");
  await expect(page.getByRole("heading", { name: "My issues" })).toBeVisible();
  await page
    .getByLabel("Describe the issue")
    .fill("Please correct my recorded lesson");
  await page.getByRole("button", { name: "Send issue" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "iLead is unavailable right now",
  );
  await expect(page.getByLabel("Describe the issue")).toHaveValue(
    "Please correct my recorded lesson",
  );
  fail = false;
  await page.getByRole("button", { name: "Send issue" }).click();
  await expect(
    page.getByText("Your issue was recorded.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Describe the issue")).toHaveValue("");
  expect(bodies[1]).toEqual({
    category: "WRONG_LESSON",
    message: "Please correct my recorded lesson",
  });
  await page.getByLabel("Issue status").selectOption("RESOLVED");
  await expect(page.getByText("Corrected to lesson 6")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/issues-mobile-dark.png",
    fullPage: true,
  });
});
test("Coordinator resolution preserves a failed note and removes the resolved row from the Open list", async ({
  page,
}) => {
  await session(page, "COORDINATOR");
  let resolved = false,
    fail = true;
  let body: unknown;
  await page.route("**/api/v1/issues?**", (r) =>
    r.fulfill({
      json: {
        data: resolved ? [] : [issue],
        meta: {
          page: 1,
          pageSize: 20,
          total: resolved ? 0 : 1,
          totalPages: resolved ? 0 : 1,
        },
      },
    }),
  );
  await page.route(`**/api/v1/issues/${issue.id}/resolve`, (r) => {
    body = r.request().postDataJSON();
    if (fail)
      return r.fulfill({
        status: 503,
        json: {
          error: { code: "UNAVAILABLE", message: "Resolution unavailable" },
        },
      });
    resolved = true;
    return r.fulfill({
      json: {
        data: {
          ...issue,
          status: "RESOLVED",
          resolutionNote: "Fixed",
          resolvedAt: issue.createdAt,
          resolvedBy: { id: "c", name: "Coordinator" },
        },
      },
    });
  });
  await page.goto("/issues");
  await expect(
    page.getByRole("heading", { name: "Roundtable issues" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Raise an issue" }),
  ).toHaveCount(0);
  await page
    .getByLabel("Resolution note (optional)")
    .fill("Corrected the entry");
  await page.getByRole("button", { name: "Resolve issue" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "iLead is unavailable right now",
  );
  await expect(page.getByLabel("Resolution note (optional)")).toHaveValue(
    "Corrected the entry",
  );
  fail = false;
  await page.getByRole("button", { name: "Resolve issue" }).click();
  await expect(page.getByText("No issues match this filter.")).toBeVisible();
  expect(body).toEqual({ resolutionNote: "Corrected the entry" });
  await page.screenshot({
    path: "artifacts/issues-coordinator-light.png",
    fullPage: true,
  });
});
test("issue lists paginate and reset to page one on filter changes", async ({
  page,
}) => {
  await session(page, "COORDINATOR");
  const urls: string[] = [];
  await page.route("**/api/v1/issues?**", (r) => {
    urls.push(r.request().url());
    const params = new URL(r.request().url()).searchParams;
    const n = Number(params.get("page"));
    return r.fulfill({
      json: {
        data: [{ ...issue, message: `Result page ${n}` }],
        meta: { page: n, pageSize: 20, total: 21, totalPages: 2 },
      },
    });
  });
  await page.goto("/issues");
  await expect(page.getByText("Result page 1")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Result page 2")).toBeVisible();
  await page.getByLabel("Issue status").selectOption("RESOLVED");
  await expect(page.getByText("Result page 1")).toBeVisible();
  expect(new URL(urls.at(-1)!).searchParams.get("page")).toBe("1");
  expect(new URL(urls.at(-1)!).searchParams.get("status")).toBe("RESOLVED");
});
test("Sponsor issue navigation redirects without requesting issue data", async ({
  page,
}) => {
  await session(page, "SPONSOR");
  let requests = 0;
  await page.route("**/api/v1/issues**", (r) => {
    requests++;
    return r.fulfill({
      status: 403,
      json: { error: { code: "FORBIDDEN", message: "Forbidden" } },
    });
  });
  await page.route("**/api/v1/dashboard/summary", (r) =>
    r.fulfill({
      json: { data: { academicYear: { label: "2026/27" }, cards: {} } },
    }),
  );
  await page.goto("/issues");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("link", { name: "Issues", exact: true }),
  ).toHaveCount(0);
  expect(requests).toBe(0);
});
