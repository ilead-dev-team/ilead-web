import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const id = "11111111-1111-4111-8111-111111111111",
  sessionId = "22222222-2222-4222-8222-222222222222",
  userId = "33333333-3333-4333-8333-333333333333";
const summaryId = "55555555-5555-4555-8555-555555555555",
  progressId = "66666666-6666-4666-8666-666666666666",
  highlightsId = "77777777-7777-4777-8777-777777777777";
const base = {
  id,
  status: "DRAFT",
  version: 1,
  author: { id: userId, name: "Coordinator" },
  session: { id: sessionId, date: "2026-10-14" },
  academicYearId: id,
  academicYear: "2026–27",
  term: { id, name: "Term 1" },
  openChangeRequests: 0,
  archivedAt: null as string | null,
  sentAt: null,
  firstReadAt: null,
  sections: [
    {
      id: summaryId,
      key: "summary",
      title: "Opening summary",
      isMandatory: true,
      autoSource: "NONE",
      position: 1,
      kind: "TEXT",
      content: { text: "Saved summary" },
    },
    {
      id: progressId,
      key: "progress",
      title: "Progress report",
      isMandatory: true,
      autoSource: "PROGRESS",
      position: 2,
      kind: "TABLE",
      content: {
        columns: ["RoundTable", "Year", "Lesson", "Category"],
        rows: [["Summits", "Year 1", "Lesson 1: Leadership", "iChoose"]],
      },
    },
    {
      id: highlightsId,
      key: "highlights",
      title: "Session Highlights",
      isMandatory: false,
      autoSource: "ACTIVITIES",
      position: 3,
      kind: "BULLETS",
      content: {
        items: [{ lead: "Reflection", text: "Delivered as planned." }],
      },
    },
  ],
};
async function auth(page: Page, role = "COORDINATOR") {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({
      json: {
        data: {
          id: userId,
          name: "Coordinator",
          email: "c@example.test",
          role,
          classYear: null,
          hasRoundtable: false,
          roundtableId: null,
        },
      },
    }),
  );
}
const rootId = "88888888-8888-4888-8888-888888888888";
const replyId = "99999999-9999-4999-8999-999999999999";
const root = {
  id: rootId,
  parentId: null as string | null,
  sectionId: summaryId as string | null,
  kind: "COMMENT",
  body: "Original discussion",
  visibleToSponsor: false,
  resolvedAt: null as string | null,
  createdAt: "2026-10-19T10:00:00.000Z",
  author: { id: userId, name: "Coordinator", role: "COORDINATOR" },
  replyCount: 0,
};
const result = (data: unknown[], page = 1, totalPages = 1) => ({
  data,
  meta: { page, pageSize: 20, total: data.length, totalPages },
});
async function open(
  page: Page,
  report = structuredClone(base),
  role = "COORDINATOR",
) {
  await auth(page, role);
  await page.route(`**/api/v1/reports/${id}`, (r) =>
    r.fulfill({ json: { data: report } }),
  );
  await page.goto(`/reports/${id}#comments`);
  await expect(
    page.getByRole("heading", { name: "Comments and change requests" }),
  ).toBeVisible();
}
test("private root and reply posts retain failures, use section anchors and preserve drafts across paging", async ({
  page,
}) => {
  let fail = true,
    totalPages = 2;
  const comments = [structuredClone(root)];
  const writes: Record<string, unknown>[] = [];
  await page.route(`**/api/v1/reports/${id}/comments**`, (r) => {
    const url = new URL(r.request().url());
    if (r.request().method() === "GET")
      return r.fulfill({
        json: url.searchParams.has("parentId")
          ? result([])
          : result(
              url.searchParams.get("page") === "2" ? [] : comments,
              Number(url.searchParams.get("page")),
              totalPages,
            ),
      });
    const body = r.request().postDataJSON();
    writes.push(body);
    if (fail)
      return r.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
      });
    const saved = {
      ...root,
      ...body,
      id: replyId,
      parentId: body.parentId ?? null,
      sectionId: body.sectionId ?? null,
    };
    if (!body.parentId) comments.push(saved);
    return r.fulfill({ status: 201, json: { data: saved } });
  });
  await open(page);
  const feedback = page.locator("#comments");
  await page
    .getByLabel("Comment message", { exact: true })
    .fill("  Anchored note  ");
  await page.getByLabel("Section reference").selectOption(summaryId);
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(feedback.getByRole("alert")).toContainText("unavailable");
  await expect(page.getByLabel("Comment message", { exact: true })).toHaveValue(
    "  Anchored note  ",
  );
  expect(writes).toEqual([{ body: "Anchored note", sectionId: summaryId }]);
  fail = false;
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(page.getByLabel("Comment message", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    feedback.getByText("Anchored note", { exact: true }),
  ).toBeVisible();
  await feedback
    .getByRole("button", { name: "Reply to thread" })
    .first()
    .click();
  await page
    .getByLabel("Reply to Coordinator", { exact: true })
    .fill("Retained reply");
  await page
    .getByRole("button", { name: "Next comments", exact: true })
    .click();
  await expect(feedback.getByText("No comments yet.")).toBeVisible();
  await page
    .getByRole("button", { name: "Previous comments", exact: true })
    .click();
  await expect(
    page.getByLabel("Reply to Coordinator", { exact: true }),
  ).toHaveValue("Retained reply");
  fail = true;
  await page.getByRole("button", { name: "Post reply", exact: true }).click();
  await expect(feedback.getByRole("alert")).toContainText("unavailable");
  await expect(
    page.getByLabel("Reply to Coordinator", { exact: true }),
  ).toHaveValue("Retained reply");
  fail = false;
  totalPages = 1;
  await page.getByRole("button", { name: "Post reply", exact: true }).click();
  await expect(
    page.getByLabel("Reply to Coordinator", { exact: true }),
  ).toHaveValue("");
  expect(writes.at(-1)).toEqual({ body: "Retained reply", parentId: rootId });
  await expect(
    feedback.getByText(/Private to Coordinators/).first(),
  ).toBeVisible();
});
test("Sponsor flags require review, retain failures and refresh report state after acknowledgement", async ({
  page,
}) => {
  const report = { ...structuredClone(base), status: "SENT" };
  let fail = true,
    flags = 0;
  const comments = [{ ...root, visibleToSponsor: true }];
  await page.route(`**/api/v1/reports/${id}/comments**`, (r) =>
    r.fulfill({ json: result(comments) }),
  );
  await page.route(`**/api/v1/reports/${id}/flag`, (r) => {
    flags++;
    expect(r.request().postDataJSON()).toEqual({ body: "Explain the outcome" });
    if (fail)
      return r.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
      });
    const comment = {
      ...root,
      kind: "CHANGE_REQUEST",
      visibleToSponsor: true,
      body: "Explain the outcome",
      author: { id: userId, name: "Sponsor", role: "SPONSOR" },
    };
    report.status = "CHANGES_REQUESTED";
    report.openChangeRequests = 1;
    comments.splice(0, 1, comment);
    return r.fulfill({
      json: { data: { id, status: report.status, comment } },
    });
  });
  await open(page, report, "SPONSOR");
  const feedback = page.locator("#comments");
  await page
    .getByRole("button", { name: "Flag for changes", exact: true })
    .click();
  await expect(feedback.getByRole("alert")).toContainText("Enter a message");
  await page
    .getByLabel("Required change-request message")
    .fill("Explain the outcome");
  await page
    .getByRole("button", { name: "Flag for changes", exact: true })
    .click();
  expect(flags).toBe(0);
  await page
    .getByRole("button", { name: "Confirm change request", exact: true })
    .click();
  await expect(feedback.getByRole("alert")).toContainText("unavailable");
  await expect(page.getByLabel("Required change-request message")).toHaveValue(
    "Explain the outcome",
  );
  fail = false;
  await page
    .getByRole("button", { name: "Confirm change request", exact: true })
    .click();
  await expect(page.getByLabel("Required change-request message")).toHaveValue(
    "",
  );
  await expect(feedback.getByText(/Open change request/)).toBeVisible();
  await expect(
    feedback.getByRole("button", {
      name: "Resolve change request",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(flags).toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => document.documentElement.classList.toggle("dark", t === "dark"),
      theme,
    );
    expect(
      (await new AxeBuilder({ page }).include("#comments").analyze())
        .violations,
    ).toEqual([]);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/report-feedback-mobile.png",
    fullPage: true,
  });
});
test("Coordinator resolution requires confirmation and preserves failed intent", async ({
  page,
}) => {
  const report = {
    ...structuredClone(base),
    status: "CHANGES_REQUESTED",
    openChangeRequests: 1,
  };
  const comment = { ...root, kind: "CHANGE_REQUEST", visibleToSponsor: true };
  let fail = true,
    writes = 0;
  await page.route(`**/api/v1/reports/${id}/comments?**`, (r) =>
    r.fulfill({ json: result([comment]) }),
  );
  await page.route(
    `**/api/v1/reports/${id}/comments/${rootId}/resolve`,
    (r) => {
      writes++;
      expect(r.request().postDataJSON()).toEqual({});
      if (fail)
        return r.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
        });
      comment.resolvedAt = "2026-10-19T11:00:00.000Z";
      report.status = "SENT";
      report.openChangeRequests = 0;
      return r.fulfill({ json: { data: comment } });
    },
  );
  await open(page, report);
  await page
    .getByRole("button", { name: "Resolve change request", exact: true })
    .click();
  expect(writes).toBe(0);
  await page
    .getByRole("button", { name: "Confirm resolution", exact: true })
    .click();
  await expect(page.locator("#comments").getByRole("alert")).toContainText(
    "unavailable",
  );
  fail = false;
  await page
    .getByRole("button", { name: "Confirm resolution", exact: true })
    .click();
  await expect(
    page
      .locator("#comments")
      .getByText(/Change request resolved/)
      .last(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resolve change request", exact: true }),
  ).toHaveCount(0);
  expect(writes).toBe(2);
});
test("Sponsor rejects private root and reply responses without exposing their text", async ({
  page,
}) => {
  let badRoots = false;
  await page.route(`**/api/v1/reports/${id}/comments**`, (r) => {
    const replies = new URL(r.request().url()).searchParams.has("parentId");
    return r.fulfill({
      json: result(
        replies
          ? [{ ...root, id: replyId, parentId: rootId, body: "SECRET REPLY" }]
          : [
              {
                ...root,
                visibleToSponsor: !badRoots,
                body: badRoots ? "SECRET ROOT" : "Public note",
              },
            ],
      ),
    });
  });
  await open(page, { ...structuredClone(base), status: "SENT" }, "SPONSOR");
  await page
    .getByRole("button", { name: "View replies (0)", exact: true })
    .click();
  await expect(page.locator("#comments").getByRole("alert")).toBeVisible();
  await expect(page.getByText("SECRET REPLY", { exact: true })).toHaveCount(0);
  badRoots = true;
  await page.reload();
  await expect(page.locator("#comments").getByRole("alert")).toBeVisible();
  await expect(page.getByText("SECRET ROOT", { exact: true })).toHaveCount(0);
});
test("archived feedback remains readable with all write controls withheld", async ({
  page,
}) => {
  await page.route(`**/api/v1/reports/${id}/comments**`, (r) => {
    expect(r.request().method()).toBe("GET");
    return r.fulfill({ json: result([root]) });
  });
  await open(page, {
    ...structuredClone(base),
    archivedAt: "2026-10-19T10:00:00.000Z",
  });
  const feedback = page.locator("#comments");
  await expect(
    feedback.getByText("Original discussion", { exact: true }),
  ).toBeVisible();
  await expect(
    feedback.getByLabel("Comment message", { exact: true }),
  ).toHaveCount(0);
  await expect(
    feedback.getByRole("button", { name: "Reply to thread", exact: true }),
  ).toHaveCount(0);
  await expect(
    feedback.getByRole("button", {
      name: "Resolve change request",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("Sponsor comment and reply posting retain rejected and malformed acknowledgements", async ({
  page,
}) => {
  let mode = "blocked";
  const writes: Record<string, unknown>[] = [];
  await page.route(`**/api/v1/reports/${id}/comments**`, (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({
        json: result(
          new URL(r.request().url()).searchParams.has("parentId")
            ? []
            : [{ ...root, visibleToSponsor: true }],
        ),
      });
    const body = r.request().postDataJSON();
    writes.push(body);
    if (mode === "blocked")
      return r.fulfill({
        status: 409,
        json: {
          error: {
            code: "REPORT_NOT_SENT",
            message: "Report is not available for feedback",
          },
        },
      });
    const comment = {
      ...root,
      ...body,
      id: replyId,
      parentId: body.parentId ?? null,
      sectionId: null,
      visibleToSponsor: true,
      author: { id: userId, name: "Sponsor", role: "SPONSOR" },
    };
    if (mode === "malformed") comment.author.id = otherUser;
    return r.fulfill({ status: 201, json: { data: comment } });
  });
  await open(page, { ...structuredClone(base), status: "SENT" }, "SPONSOR");
  await page
    .getByLabel("Comment message", { exact: true })
    .fill("Public feedback");
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(page.locator("#comments").getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Comment message", { exact: true })).toHaveValue(
    "Public feedback",
  );
  mode = "malformed";
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(page.locator("#comments").getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Comment message", { exact: true })).toHaveValue(
    "Public feedback",
  );
  mode = "ok";
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(page.getByLabel("Comment message", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByRole("button", { name: "Reply to thread", exact: true })
    .click();
  await page
    .getByLabel("Reply to Coordinator", { exact: true })
    .fill("Public reply");
  await page.getByRole("button", { name: "Post reply", exact: true }).click();
  await expect(
    page.getByLabel("Reply to Coordinator", { exact: true }),
  ).toHaveValue("");
  expect(writes.at(-1)).toEqual({ body: "Public reply", parentId: rootId });
});
const otherUser = "44444444-4444-4444-8444-444444444444";
