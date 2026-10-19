import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const id = "11111111-1111-4111-8111-111111111111",
  sessionId = "22222222-2222-4222-8222-222222222222",
  userId = "33333333-3333-4333-8333-333333333333",
  otherId = "44444444-4444-4444-8444-444444444444";
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

async function open(
  page: Page,
  report = { ...structuredClone(base), status: "SENT" },
  role = "COORDINATOR",
) {
  await auth(page, role);
  await page.route(`**/api/v1/reports/${id}`, (r) =>
    r.fulfill({ json: { data: report } }),
  );
  await page.goto(`/reports/${id}`);
  await expect(
    page.getByRole("heading", { name: "Session report", exact: true }),
  ).toBeVisible();
}
test("non-author Coordinator confirms archive/unarchive, retains failures and unsent discussions, and keeps archived content read only", async ({
  page,
}) => {
  const report = {
    ...structuredClone(base),
    status: "SENT",
    author: { id: otherId, name: "Another Coordinator" },
  };
  let archiveMode = "blocked",
    unarchiveFail = true;
  const writes: string[] = [];
  await page.route(`**/api/v1/reports/${id}/comments?**`, (r) =>
    r.fulfill({
      json: {
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
    }),
  );
  await page.route(`**/api/v1/reports/${id}/archive`, (r) => {
    writes.push("archive");
    expect(r.request().postDataJSON()).toEqual({});
    if (archiveMode === "blocked")
      return r.fulfill({
        status: 409,
        json: {
          error: {
            code: "REPORT_NOT_ARCHIVABLE",
            message:
              "Only sent reports without open change requests can be archived",
          },
        },
      });
    if (archiveMode === "malformed")
      return r.fulfill({ json: { data: report } });
    report.archivedAt = "2026-10-19T10:00:00Z";
    return r.fulfill({ json: { data: report } });
  });
  await page.route(`**/api/v1/reports/${id}/unarchive`, (r) => {
    writes.push("unarchive");
    expect(r.request().postDataJSON()).toEqual({});
    if (unarchiveFail)
      return r.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
      });
    report.archivedAt = null;
    return r.fulfill({ json: { data: report } });
  });
  await open(page, report);
  await page
    .getByRole("button", { name: "Show comments and feedback", exact: true })
    .click();
  await page
    .getByLabel("Comment message", { exact: true })
    .fill("Keep this unsent message");
  await page
    .getByRole("button", { name: "Archive report", exact: true })
    .click();
  expect(writes).toEqual([]);
  await page
    .getByRole("button", { name: "Back to report", exact: true })
    .click();
  expect(writes).toEqual([]);
  await page
    .getByRole("button", { name: "Archive report", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm archive", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "without open change requests",
  );
  await expect(
    page.getByRole("button", { name: "Confirm archive", exact: true }),
  ).toBeVisible();
  archiveMode = "malformed";
  await page
    .getByRole("button", { name: "Confirm archive", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Something went wrong",
  );
  await expect(
    page.getByRole("button", { name: "Archive report", exact: true }),
  ).toBeVisible();
  archiveMode = "ok";
  await page
    .getByRole("button", { name: "Confirm archive", exact: true })
    .click();
  await expect(
    page.getByText("Archived — read only", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Post comment", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reopen to edit", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Export current report .docx",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole("region", { name: "Unsent discussion drafts", exact: true }),
  ).toContainText("Keep this unsent message");
  await page
    .getByRole("button", { name: "Unarchive report", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm unarchive", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "unavailable",
  );
  unarchiveFail = false;
  await page
    .getByRole("button", { name: "Confirm unarchive", exact: true })
    .click();
  await expect(
    page.getByText("Report unarchived.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Comment message", { exact: true })).toHaveValue(
    "Keep this unsent message",
  );
  await expect(
    page.getByRole("button", { name: "Archive report", exact: true }),
  ).toBeEnabled();
  expect(writes).toEqual([
    "archive",
    "archive",
    "archive",
    "unarchive",
    "unarchive",
  ]);
});
test("active and archived lists refresh across archive and unarchive without deleting records", async ({
  page,
}) => {
  const report = { ...structuredClone(base), status: "SENT" };
  await auth(page);
  await page.route(`**/api/v1/reports?**`, (r) => {
    const archived =
      new URL(r.request().url()).searchParams.get("archived") === "true";
    const data = archived === !!report.archivedAt ? [report] : [];
    return r.fulfill({
      json: {
        data,
        meta: {
          page: 1,
          pageSize: 20,
          total: data.length,
          totalPages: data.length,
        },
      },
    });
  });
  await page.route(`**/api/v1/reports/${id}`, (r) =>
    r.fulfill({ json: { data: report } }),
  );
  await page.route(`**/api/v1/reports/${id}/archive`, (r) => {
    report.archivedAt = "2026-10-19T10:00:00Z";
    return r.fulfill({ json: { data: report } });
  });
  await page.route(`**/api/v1/reports/${id}/unarchive`, (r) => {
    report.archivedAt = null;
    return r.fulfill({ json: { data: report } });
  });
  await page.goto("/reports");
  await page
    .getByRole("link", { name: "2026-10-14 report", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Archive report", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm archive", exact: true })
    .click();
  await expect(
    page.getByText("Report archived.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(
    page.getByText("No matching reports.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Archived reports", { exact: true }).check();
  await page
    .getByRole("link", { name: "2026-10-14 report", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Unarchive report", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm unarchive", exact: true })
    .click();
  await expect(
    page.getByText("Report unarchived.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "2026-10-14 report", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Archived reports", { exact: true }).check();
  await expect(
    page.getByText("No matching reports.", { exact: true }),
  ).toBeVisible();
});
test("Sponsor has no archive controls and open requests disable Coordinator archival", async ({
  page,
}) => {
  let writes = 0;
  await page.route(`**/api/v1/reports/${id}/archive`, (r) => {
    writes++;
    return r.fulfill({ status: 403 });
  });
  for (const role of ["SPONSOR", "COORDINATOR"]) {
    await open(
      page,
      {
        ...structuredClone(base),
        status: role === "SPONSOR" ? "SENT" : "CHANGES_REQUESTED",
        openChangeRequests: 1,
      },
      role,
    );
    if (role === "SPONSOR") {
      await expect(
        page.getByRole("button", { name: "Archive report", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Unarchive report", exact: true }),
      ).toHaveCount(0);
    } else
      await expect(
        page.getByRole("button", { name: "Archive report", exact: true }),
      ).toBeDisabled();
  }
  expect(writes).toBe(0);
});
test("archived owner must unarchive before reopening; unsent draft recovery stays accessible on mobile", async ({
  page,
}) => {
  const report = { ...structuredClone(base), status: "SENT" };
  await page.route(`**/api/v1/reports/${id}/comments?**`, (r) =>
    r.fulfill({
      json: {
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
    }),
  );
  await page.route(`**/api/v1/reports/${id}/archive`, (r) => {
    report.archivedAt = "2026-10-19T10:00:00Z";
    return r.fulfill({ json: { data: report } });
  });
  await open(page, report);
  await page
    .getByRole("button", { name: "Show comments and feedback", exact: true })
    .click();
  await page
    .getByLabel("Comment message", { exact: true })
    .fill("Copy or discard me");
  await page
    .getByRole("button", { name: "Archive report", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm archive", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reopen to edit", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Unarchive report", exact: true }),
  ).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => document.documentElement.classList.toggle("dark", t === "dark"),
      theme,
    );
    expect(
      (await new AxeBuilder({ page }).include("main").analyze()).violations,
    ).toEqual([]);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("region", { name: "Unsent discussion drafts", exact: true })
    .screenshot({ path: "test-results/report-archive-drafts-mobile.png" });
  await page
    .getByRole("button", {
      name: "Discard unsent discussion drafts",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", { name: "Unsent discussion drafts", exact: true }),
  ).toHaveCount(0);
});
