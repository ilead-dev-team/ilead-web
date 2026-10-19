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

const mime =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const file = Buffer.from([80, 75, 3, 4, 1, 2, 3]);
const published = (version: number) => ({
  ...structuredClone(base),
  version,
  status: "SENT",
  sentAt: "2026-10-19T10:00:00Z",
  sections: base.sections.map((section, index) =>
    index === 0
      ? { ...section, content: { text: `Published version ${version}` } }
      : section,
  ),
});
const listing = (data: unknown[], page = 1, totalPages = 1) => ({
  data,
  meta: { page, pageSize: 20, total: data.length, totalPages },
});
async function open(
  page: Page,
  report = { ...structuredClone(base), status: "SENT" },
  role = "SPONSOR",
) {
  await auth(page, role);
  await page.route(`**/api/v1/reports/${id}`, (r) =>
    r.fulfill({ json: { data: report } }),
  );
  await page.goto(`/reports/${id}`);
  await expect(
    page.getByRole("heading", {
      name: "Versions and Word downloads",
      exact: true,
    }),
  ).toBeVisible();
}
test("version list retries and pages, and selected snapshots reject drafts and mismatched versions without fallback", async ({
  page,
}) => {
  let fail = true,
    bad = true;
  const requests: string[] = [];
  await page.route(`**/api/v1/reports/${id}/versions?**`, (r) => {
    const p = new URL(r.request().url()).searchParams.get("page");
    requests.push(p!);
    if (fail)
      return r.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
      });
    return r.fulfill({
      json: listing(
        [{ version: p === "2" ? 1 : 2, sentAt: "2026-10-19T10:00:00Z" }],
        Number(p),
        2,
      ),
    });
  });
  await page.route(`**/api/v1/reports/${id}/versions/2`, (r) =>
    r.fulfill({
      json: {
        data: bad
          ? {
              ...published(2),
              status: "DRAFT",
              sections: published(2).sections.map((s) => ({
                ...s,
                content: { text: "SECRET DRAFT" },
              })),
            }
          : published(2),
      },
    }),
  );
  await page.route(`**/api/v1/reports/${id}/versions/1`, (r) =>
    r.fulfill({ json: { data: published(2) } }),
  );
  await open(page);
  expect(requests).toEqual([]);
  await page
    .getByRole("button", { name: "Show sent versions", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry version list", exact: true }),
  ).toBeVisible();
  fail = false;
  await page
    .getByRole("button", { name: "Retry version list", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View sent version 2", exact: true })
    .click();
  const selected = page.getByRole("region", {
    name: "Selected sent version",
    exact: true,
  });
  await expect(selected.getByRole("alert")).toBeVisible();
  await expect(page.getByText("SECRET DRAFT", { exact: true })).toHaveCount(0);
  bad = false;
  await page
    .getByRole("button", { name: "Retry selected version", exact: true })
    .click();
  await expect(
    selected.getByText("Published version 2", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Next versions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View sent version 1", exact: true })
    .click();
  await expect(selected.getByRole("alert")).toBeVisible();
  await expect(
    selected.getByText("Published version 2", { exact: true }),
  ).toHaveCount(0);
  await expect(
    selected.getByRole("button", { name: /Export sent version/ }),
  ).toHaveCount(0);
  expect(requests).toEqual(["1", "1", "2"]);
});
test("current and selected-version downloads handle server/mime failures then hand exact Word files to browser", async ({
  page,
}) => {
  let mode = "fail";
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.route(`**/api/v1/reports/${id}/export/docx`, (r) =>
    mode === "fail"
      ? r.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
        })
      : mode === "html"
        ? r.fulfill({ contentType: "text/html", body: "<html>error</html>" })
        : r.fulfill({ contentType: mime, body: file }),
  );
  await page.route(`**/api/v1/reports/${id}/versions?**`, (r) =>
    r.fulfill({
      json: listing([{ version: 1, sentAt: "2026-10-19T10:00:00Z" }]),
    }),
  );
  await page.route(`**/api/v1/reports/${id}/versions/1`, (r) =>
    r.fulfill({ json: { data: published(1) } }),
  );
  await page.route(`**/api/v1/reports/${id}/versions/1/export/docx`, (r) =>
    r.fulfill({ contentType: mime, body: file }),
  );
  await open(page);
  await page
    .getByRole("button", { name: "Export current report .docx", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "unavailable",
  );
  expect(downloads).toBe(0);
  mode = "html";
  await page
    .getByRole("button", { name: "Export current report .docx", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Something went wrong",
  );
  expect(downloads).toBe(0);
  mode = "ok";
  const current = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export current report .docx", exact: true })
    .click();
  expect((await current).suggestedFilename()).toBe(
    "RCA_iLead_Session_Report_2026-10-14.docx",
  );
  await page
    .getByRole("button", { name: "Show sent versions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View sent version 1", exact: true })
    .click();
  const previous = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export sent version 1 .docx", exact: true })
    .click();
  expect((await previous).suggestedFilename()).toBe(
    "RCA_iLead_Session_Report_2026-10-14_v1.docx",
  );
  expect(downloads).toBe(2);
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
    .getByRole("button", { name: "Close sent version", exact: true })
    .focus();
  await page
    .getByRole("heading", { name: "Versions and Word downloads", exact: true })
    .locator("..")
    .screenshot({ path: "test-results/report-history-mobile.png" });
});
test("unsaved author content blocks current export, saved content enables it, and empty history stays explicit", async ({
  page,
}) => {
  let exports = 0;
  await page.route(`**/api/v1/reports/${id}/sections`, (r) => {
    const sections = r.request().postDataJSON().sections;
    return r.fulfill({
      json: {
        data: {
          ...base,
          sections: base.sections.map((s, index) => ({
            ...s,
            ...sections[index],
          })),
        },
      },
    });
  });
  await page.route(`**/api/v1/reports/${id}/export/docx`, (r) => {
    exports++;
    return r.fulfill({
      status: 403,
      json: { error: { code: "FORBIDDEN", message: "Export unavailable" } },
    });
  });
  await page.route(`**/api/v1/reports/${id}/versions?**`, (r) =>
    r.fulfill({ json: listing([], 1, 0) }),
  );
  await open(page, structuredClone(base), "COORDINATOR");
  await page
    .getByLabel("Opening summary text", { exact: true })
    .fill("Not saved yet");
  await expect(
    page.getByRole("button", {
      name: "Export current report .docx",
      exact: true,
    }),
  ).toBeDisabled();
  expect(exports).toBe(0);
  await page.getByRole("button", { name: "Save report", exact: true }).click();
  await expect(
    page.getByText("Saved report content", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Export current report .docx", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Export unavailable",
  );
  expect(exports).toBe(1);
  await page
    .getByRole("button", { name: "Show sent versions", exact: true })
    .click();
  await expect(
    page.getByText("No sent versions yet.", { exact: true }),
  ).toBeVisible();
});
test("archived sent reports retain export access while Facilitators never request history or downloads", async ({
  page,
}) => {
  let calls = 0;
  await page.route(`**/api/v1/reports/${id}/export/docx`, (r) => {
    calls++;
    return r.fulfill({ contentType: mime, body: file });
  });
  await open(page, {
    ...structuredClone(base),
    status: "SENT",
    archivedAt: "2026-10-19T10:00:00Z",
  });
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export current report .docx", exact: true })
    .click();
  await event;
  expect(calls).toBe(1);
  await page.route("**/api/v1/curriculum", (r) =>
    r.fulfill({
      status: 503,
      json: {
        error: { code: "UNAVAILABLE", message: "Test curriculum unavailable" },
      },
    }),
  );
  await auth(page, "FACILITATOR");
  await page.goto(`/reports/${id}`);
  await expect(page).not.toHaveURL(`/reports/${id}`);
  await expect(
    page.getByRole("heading", {
      name: "Versions and Word downloads",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(calls).toBe(1);
});

test("an open version list refreshes after the author publishes a new version", async ({
  page,
}) => {
  let currentVersion = 1;
  await page.route(`**/api/v1/reports/${id}/versions?**`, (r) =>
    r.fulfill({
      json: listing([
        { version: currentVersion, sentAt: "2026-10-19T10:00:00Z" },
      ]),
    }),
  );
  await page.route(`**/api/v1/reports/${id}/send`, (r) => {
    currentVersion = 2;
    return r.fulfill({ json: { data: published(2) } });
  });
  await open(
    page,
    { ...structuredClone(base), status: "FINAL" },
    "COORDINATOR",
  );
  await page
    .getByRole("button", { name: "Show sent versions", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "View sent version 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Send to Sponsor", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm sending", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "View sent version 2", exact: true }),
  ).toBeVisible();
});
