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
  await page.route("https://**/*", (r) => r.abort());
  await page.route("**/api/v1/**", (r) =>
    r.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "Not mocked" } },
    }),
  );
  await page.route("**/api/v1/notifications/unread-count", (r) =>
    r.fulfill({ json: { data: { count: 0 } } }),
  );
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
        status: 400,
        json: { error: { code: "UNAVAILABLE", message: "Try again later" } },
      });
    saved = true;
    return r.fulfill({
      status: 201,
      json: { data: { ...issue, ...r.request().postDataJSON() } },
    });
  });
  await page.goto("/issues");
  await expect(page.getByRole("heading", { name: "My issues" })).toBeVisible();
  await page
    .getByLabel("Describe the issue")
    .fill("Please correct my recorded lesson");
  await page.getByRole("button", { name: "Send issue" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Try again later",
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
          resolutionNote: "Corrected the entry",
          resolvedAt: issue.createdAt,
          resolvedBy: { id: user.id, name: "Coordinator" },
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
  await page.getByRole("button", { name: "Retry resolution" }).click();
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
        data: [
          {
            ...issue,
            message: `Result page ${n}`,
            ...(params.get("status") === "RESOLVED"
              ? {
                  status: "RESOLVED",
                  resolvedAt: issue.createdAt,
                  resolvedBy: { id: user.id, name: "Coordinator" },
                }
              : {}),
          },
        ],
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

function issueList(rows: unknown[] = [], page = 1, total = rows.length) {
  return {
    data: rows,
    meta: { page, pageSize: 20, total, totalPages: Math.ceil(total / 20) },
  };
}
test("unconfirmed creation retains text and requires read-only inspection and deliberate new send", async ({
  page,
}) => {
  await session(page);
  let posts = 0,
    failRead = false;
  await page.route("**/api/v1/issues?**", (r) =>
    failRead
      ? r.fulfill({ status: 503, json: {} })
      : r.fulfill({ json: issueList() }),
  );
  await page.route("**/api/v1/issues", (r) => {
    posts++;
    return r.fulfill({ status: 503, json: {} });
  });
  await page.goto("/issues");
  await page.getByLabel("Describe the issue").fill("Retain this message");
  await page.getByRole("button", { name: "Send issue", exact: true }).click();
  await expect(
    page.getByText("Sending is unconfirmed.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Describe the issue")).toHaveValue(
    "Retain this message",
  );
  await expect(
    page.getByRole("button", { name: "Send issue", exact: true }),
  ).toBeDisabled();
  failRead = true;
  await page.getByRole("button", { name: "Check existing issues" }).click();
  await expect(
    page.getByText("The latest issue views could not be loaded.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "I reviewed the list; allow a new issue",
    }),
  ).toHaveCount(0);
  failRead = false;
  await page.getByRole("button", { name: "Check existing issues" }).click();
  await expect(page.getByLabel("Issue status")).toHaveValue("");
  const allow = page.getByRole("button", {
    name: "I reviewed the list; allow a new issue",
  });
  await expect(allow).toBeEnabled();
  expect(posts).toBe(1);
  await allow.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Send issue", exact: true }),
  ).toBeEnabled();
  expect(posts).toBe(1);
});
test("a mismatched create acknowledgement never clears the draft or claims success", async ({
  page,
}) => {
  await session(page);
  await page.route("**/api/v1/issues?**", (r) =>
    r.fulfill({ json: issueList() }),
  );
  await page.route("**/api/v1/issues", (r) =>
    r.fulfill({ status: 201, json: { data: issue } }),
  );
  await page.goto("/issues");
  await page.getByLabel("Describe the issue").fill("A different message");
  await page.getByRole("button", { name: "Send issue", exact: true }).click();
  await expect(
    page.getByText("Sending is unconfirmed.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Describe the issue")).toHaveValue(
    "A different message",
  );
  await expect(
    page.getByText("Your issue was recorded.", { exact: false }),
  ).toHaveCount(0);
});
test("confirmed creation survives refresh failure and refresh retry never posts", async ({
  page,
}) => {
  await session(page);
  let posts = 0,
    failRead = false;
  await page.route("**/api/v1/issues?**", (r) =>
    failRead
      ? r.fulfill({ status: 503, json: {} })
      : r.fulfill({ json: issueList() }),
  );
  await page.route("**/api/v1/issues", (r) => {
    posts++;
    failRead = true;
    return r.fulfill({
      status: 201,
      json: { data: { ...issue, ...r.request().postDataJSON() } },
    });
  });
  await page.goto("/issues");
  await page.getByLabel("Describe the issue").fill("Help with lesson");
  await page.getByRole("button", { name: "Send issue", exact: true }).click();
  await expect(
    page.getByText("Your issue was recorded.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Describe the issue")).toHaveValue("");
  const retry = page.getByRole("button", { name: "Retry refreshing issues" });
  await expect(retry).toBeEnabled();
  failRead = false;
  await retry.click();
  await expect(retry).toHaveCount(0);
  expect(posts).toBe(1);
});
test("existing resolution is shown truthfully and retained after failed refresh", async ({
  page,
}) => {
  await session(page, "COORDINATOR");
  let posts = 0,
    failRead = false;
  await page.route("**/api/v1/issues?**", (r) =>
    failRead
      ? r.fulfill({ status: 503, json: {} })
      : r.fulfill({ json: issueList([issue]) }),
  );
  await page.route(`**/api/v1/issues/${issue.id}/resolve`, (r) => {
    posts++;
    failRead = true;
    return r.fulfill({
      json: {
        data: {
          ...issue,
          status: "RESOLVED",
          resolvedAt: issue.createdAt,
          resolutionNote: "Already corrected",
          resolvedBy: { id: "other", name: "Other Coordinator" },
        },
      },
    });
  });
  await page.goto("/issues");
  await expect(
    page.getByRole("link", { name: "Pinnacles", exact: true }),
  ).toHaveAttribute("href", `/roundtables/${user.roundtableId}`);
  await page.getByLabel("Resolution note (optional)").fill("My proposed note");
  await page
    .getByRole("button", { name: "Resolve issue", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("An existing resolution was returned", { exact: false }),
  ).toContainText("Already corrected");
  await expect(
    page.getByRole("heading", { name: "Roundtable issues" }),
  ).toBeFocused();
  await expect(page.getByLabel("Resolution note (optional)")).toHaveValue(
    "My proposed note",
  );
  failRead = false;
  await page.getByRole("button", { name: "Retry refreshing issues" }).click();
  expect(posts).toBe(1);
});
test("pending resolution blocks duplicate submissions and list navigation", async ({
  page,
}) => {
  await session(page, "COORDINATOR");
  let release!: () => void,
    posts = 0;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/issues?**", (r) =>
    r.fulfill({ json: issueList([issue]) }),
  );
  await page.route(`**/api/v1/issues/${issue.id}/resolve`, async (r) => {
    posts++;
    await pending;
    await r.fulfill({
      status: 400,
      json: { error: { code: "TEST", message: "Known rejection" } },
    });
  });
  await page.goto("/issues");
  await page.getByLabel("Resolution note (optional)").fill("Retain note");
  await page
    .getByRole("button", { name: "Resolve issue", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Resolving…" })).toBeDisabled();
  await expect(page.getByLabel("Issue status")).toBeDisabled();
  await page.locator("article form").evaluate((form) => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  expect(posts).toBe(1);
  release();
  await expect(
    page.getByText("Known rejection", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Resolution note (optional)")).toBeEnabled();
  await expect(page.getByLabel("Resolution note (optional)")).toHaveValue(
    "Retain note",
  );
});
test("malformed scoped pages fail closed and a failed later page offers Previous", async ({
  page,
}) => {
  await session(page);
  let mode = "foreign";
  await page.route("**/api/v1/issues?**", (r) => {
    const n = Number(new URL(r.request().url()).searchParams.get("page"));
    if (n === 2) return r.fulfill({ status: 503, json: {} });
    return r.fulfill({
      json: issueList(
        [
          {
            ...issue,
            ...(mode === "foreign"
              ? { raisedBy: { id: "other", name: "Other" } }
              : {}),
          },
        ],
        1,
        21,
      ),
    });
  });
  await page.goto("/issues");
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByText(issue.message, { exact: true })).toHaveCount(0);
  mode = "valid";
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText(issue.message, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByText(issue.message, { exact: true })).toBeVisible();
});
for (const theme of ["light", "dark"] as const) {
  test(`320px ${theme} issue uncertainty is accessible and retains keyboard recovery`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await session(page);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.route("**/api/v1/issues?**", (r) =>
      r.fulfill({ json: issueList() }),
    );
    await page.route("**/api/v1/issues", (r) =>
      r.fulfill({ status: 503, json: {} }),
    );
    await page.goto("/issues");
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await page
      .getByLabel("Describe the issue")
      .fill(
        "A long retained message about the lesson recorded for our roundtable.",
      );
    await page.getByRole("button", { name: "Send issue", exact: true }).click();
    await expect(
      page.getByText("Sending is unconfirmed.", { exact: false }),
    ).toBeVisible();
    const check = page.getByRole("button", { name: "Check existing issues" });
    await check.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", {
        name: "I reviewed the list; allow a new issue",
      }),
    ).toBeEnabled();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await check.focus();
    await page.screenshot({
      path: `artifacts/issues-uncertain-320-${theme}.png`,
      fullPage: true,
    });
  });
}

test("a mismatched resolution response retains the note and offers only a deliberate resolution retry", async ({
  page,
}) => {
  await session(page, "COORDINATOR");
  await page.route("**/api/v1/issues?**", (r) =>
    r.fulfill({ json: issueList([issue]) }),
  );
  let posts = 0;
  await page.route(`**/api/v1/issues/${issue.id}/resolve`, (r) => {
    posts++;
    return r.fulfill({
      json: {
        data: {
          ...issue,
          id: "another",
          status: "RESOLVED",
          resolvedAt: issue.createdAt,
          resolvedBy: { id: user.id, name: user.name },
        },
      },
    });
  });
  await page.goto("/issues");
  await page.getByLabel("Resolution note (optional)").fill("Retain exact note");
  await page
    .getByRole("button", { name: "Resolve issue", exact: true })
    .click();
  await expect(
    page.getByText("Resolution is unconfirmed.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Resolution note (optional)")).toHaveValue(
    "Retain exact note",
  );
  await expect(page.getByLabel("Resolution note (optional)")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Retry resolution", exact: true }),
  ).toBeEnabled();
  expect(posts).toBe(1);
});
test("cached read failure preserves the Coordinator note but blocks resolution until a valid read", async ({
  page,
}) => {
  await session(page, "COORDINATOR");
  await page.clock.install({ time: new Date("2026-10-21T09:00:00Z") });
  let fail = false;
  await page.route("**/api/v1/issues?**", (r) =>
    fail
      ? r.fulfill({ status: 503, json: {} })
      : r.fulfill({ json: issueList([issue]) }),
  );
  await page.goto("/issues");
  await page
    .getByLabel("Resolution note (optional)")
    .fill("Keep draft during failed read");
  fail = true;
  await page.clock.fastForward(31000);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true })),
  );
  await expect(
    page.getByText("Last loaded issues are shown.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resolve issue", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Resolution note (optional)")).toHaveValue(
    "Keep draft during failed read",
  );
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resolve issue", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Resolution note (optional)")).toHaveValue(
    "Keep draft during failed read",
  );
});
