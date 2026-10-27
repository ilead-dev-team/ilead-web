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
  archivedAt: null,
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
test("author creates, edits, preserves failed saves, confirms and sends only after explicit confirmation", async ({
  page,
}) => {
  test.setTimeout(60000);
  await auth(page);
  const report = structuredClone(base);
  let failSave = true,
    failSend = true;
  const writes: Record<string, unknown>[] = [];
  await page.route(`**/api/v1/sessions/${sessionId}`, (r) =>
    r.fulfill({
      json: {
        data: {
          id: sessionId,
          date: "2026-10-14",
          status: "HELD",
          cancellationReason: null,
          notes: "",
          academicYear: { id, label: "2026–27" },
          term: { id, name: "Term 1", number: 1 },
          createdBy: { id: userId, name: "Coordinator" },
          activities: [],
          counts: { roundtables: 0, met: 0, notMet: 0, pending: 0 },
          report: null,
        },
      },
    }),
  );
  await page.route("**/api/v1/activity-types?**", (r) =>
    r.fulfill({
      json: {
        data: [],
        meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
      },
    }),
  );
  await page.route(`**/api/v1/sessions/${sessionId}/report`, (r) => {
    expect(r.request().postDataJSON()).toEqual({});
    return r.fulfill({ status: 201, json: { data: report } });
  });
  await page.route(`**/api/v1/reports/${id}`, (r) =>
    r.fulfill({ json: { data: report } }),
  );
  await page.route(`**/api/v1/reports/${id}/sections`, (r) => {
    const body = r.request().postDataJSON();
    writes.push(body);
    expect(Object.keys(body.sections[0]).sort()).toEqual([
      "content",
      "id",
      "kind",
      "title",
    ]);
    if (failSave)
      return r.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
      });
    report.sections[0]!.content = { text: body.sections[0].content.text };
    return r.fulfill({ json: { data: report } });
  });
  await page.route(`**/api/v1/reports/${id}/confirm`, (r) => {
    expect(r.request().postDataJSON()).toEqual({});
    report.status = "FINAL";
    return r.fulfill({ json: { data: report } });
  });
  await page.route(`**/api/v1/reports/${id}/send`, (r) => {
    if (failSend)
      return r.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
      });
    report.status = "SENT";
    return r.fulfill({ json: { data: report } });
  });
  await page.route(`**/api/v1/reports/${id}/reopen`, (r) => {
    expect(r.request().postDataJSON()).toEqual({});
    report.status = "DRAFT";
    return r.fulfill({ json: { data: report } });
  });
  await page.goto(`/sessions/${sessionId}`);
  await page
    .getByRole("button", { name: "Create report", exact: true })
    .click();
  await expect(page).toHaveURL(`/reports/${id}`, { timeout: 20000 });
  await expect(
    page.getByRole("button", { name: "Remove section Opening summary" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Move down Opening summary" }),
  ).toBeDisabled();
  await expect(
    page
      .locator(`#report-section-${progressId}`)
      .getByRole("cell", { name: "Lesson 1: Leadership", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Opening summary text").fill("Updated narrative");
  await expect(
    page.getByRole("button", { name: "Confirm report", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Save report", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "iLead is unavailable",
  );
  await expect(page.getByLabel("Opening summary text")).toHaveValue(
    "Updated narrative",
  );
  failSave = false;
  await page.getByRole("button", { name: "Save report", exact: true }).click();
  await expect(page.getByText("Report saved.", { exact: true })).toBeVisible();
  expect(writes.length).toBe(2);
  await page
    .getByRole("button", { name: "Confirm report", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm report now" }).click();
  await expect(page.getByRole("heading", { name: "2026-10-14" })).toBeVisible();
  await expect(page.getByLabel("Opening summary text")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Send to Sponsor", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm sending" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "iLead is unavailable",
  );
  await expect(page.getByRole("heading", { name: "2026-10-14" })).toBeVisible();
  failSend = false;
  await page.getByRole("button", { name: "Confirm sending" }).click();
  await expect(page.getByRole("heading", { name: "2026-10-14" })).toBeVisible();
  await page.getByRole("button", { name: "Reopen to edit" }).click();
  await page
    .getByRole("button", { name: "Reopen report", exact: true })
    .click();
  await expect(page.getByLabel("Opening summary text")).toBeVisible();
});
test("custom sections and generated refreshes preserve progress protections and accessible layout", async ({
  page,
}) => {
  test.setTimeout(60000);
  await auth(page);
  let report = structuredClone(base);
  await page.route(`**/api/v1/reports/${id}`, (r) =>
    r.fulfill({ json: { data: report } }),
  );
  await page.route(`**/api/v1/reports/${id}/sections`, (r) => {
    const sections = r.request().postDataJSON().sections;
    report = {
      ...report,
      sections: sections.map(
        (input: (typeof report.sections)[number], index: number) => ({
          ...(report.sections.find((section) => section.id === input.id) ?? {
            key: null,
            isMandatory: false,
            autoSource: "NONE",
          }),
          ...input,
          id: input.id ?? otherId,
          position: index + 1,
        }),
      ),
    };
    return r.fulfill({ json: { data: report } });
  });
  let refreshes = 0;
  await page.route(`**/api/v1/reports/${id}/sections/regenerate`, (r) => {
    expect(r.request().postDataJSON()).toEqual({ key: "highlights" });
    refreshes++;
    return r.fulfill({ json: { data: report } });
  });
  await page.goto(`/reports/${id}`);
  await page
    .getByLabel("Bullet 1 text", { exact: true })
    .fill("Updated reflection");
  await page.getByLabel("Section title", { exact: true }).fill("Reflections");
  await page.getByLabel("Section kind", { exact: true }).selectOption("TABLE");
  await page.getByRole("button", { name: "Add custom section" }).click();
  const custom = page.locator("article[id^=report-section-]").filter({
    has: page.getByRole("heading", { name: "Reflections", exact: true }),
  });
  await custom.getByRole("button", { name: "Add column" }).click();
  await custom.getByLabel("Column 2 heading").fill("Outcome");
  await custom.getByRole("button", { name: "Add row", exact: true }).click();
  await custom.getByLabel("Row 1, Column", { exact: true }).fill("Reflection");
  await custom
    .getByLabel("Row 1, Outcome", { exact: true })
    .fill("Improved focus");
  await page
    .getByRole("button", { name: "Move up Reflections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move down Reflections", exact: true })
    .click();
  await page.getByLabel("Section title", { exact: true }).fill("Temporary");
  await page.getByRole("button", { name: "Add custom section" }).click();
  await page
    .getByRole("button", { name: "Remove section Temporary", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Refresh highlights from session" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Save report", exact: true }).click();
  await expect(page.getByText("Report saved.", { exact: true })).toBeVisible();
  expect(report.sections).toHaveLength(4);
  expect(report.sections[2]!.content).toEqual({
    items: [{ lead: "Reflection", text: "Updated reflection" }],
  });
  expect(report.sections[3]!.content).toEqual({
    columns: ["Column", "Outcome"],
    rows: [["Reflection", "Improved focus"]],
  });
  await page
    .getByRole("button", { name: "Refresh highlights from session" })
    .click();
  expect(refreshes).toBe(0);
  await page
    .getByRole("button", { name: "Replace highlights from session" })
    .click();
  await expect.poll(() => refreshes).toBe(1);
  await expect(
    page.getByRole("group", { name: "Refresh highlights from session" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "artifacts/report-builder-mobile-dark.png",
    fullPage: true,
  });
  await custom.screenshot({
    path: "artifacts/report-custom-table-mobile-dark.png",
  });
});
test("another Coordinator reads a draft and takes over only after confirmation", async ({
  page,
}) => {
  await auth(page);
  let report = {
    ...structuredClone(base),
    author: { id: otherId, name: "Original author" },
  };
  await page.route(`**/api/v1/reports/${id}`, (r) =>
    r.fulfill({ json: { data: report } }),
  );
  let takeovers = 0;
  await page.route(`**/api/v1/reports/${id}/takeover`, (r) => {
    takeovers++;
    report = { ...report, author: base.author };
    return r.fulfill({ json: { data: report } });
  });
  await page.goto(`/reports/${id}`);
  await expect(
    page.getByRole("button", { name: "Save report", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Take over report", exact: true })
    .click();
  expect(takeovers).toBe(0);
  await page.getByRole("button", { name: "Confirm takeover" }).click();
  await expect(page.getByLabel("Opening summary text")).toBeVisible();
  expect(takeovers).toBe(1);
});
test("Sponsor reads sent content but rejects any draft response before rendering", async ({
  page,
}) => {
  await auth(page, "SPONSOR");
  let report = { ...structuredClone(base), status: "SENT" };
  await page.route("**/api/v1/reports?**", (r) =>
    r.fulfill({
      json: {
        data: [report],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    }),
  );
  await page.route(`**/api/v1/reports/${id}`, (r) =>
    r.fulfill({ json: { data: report } }),
  );
  await page.goto("/reports");
  await expect(
    page
      .getByLabel("Report status")
      .getByRole("option", { name: "Draft", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "2026-10-14 report" }).click();
  await expect(page.getByText("Saved summary", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save report", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reopen to edit" }),
  ).toHaveCount(0);
  report = {
    ...report,
    status: "DRAFT",
    sections: [
      { ...base.sections[0]!, content: { text: "Private live edit" } },
      ...base.sections.slice(1),
    ],
  };
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Something went wrong",
  );
  await expect(
    page.getByText("Private live edit", { exact: true }),
  ).toHaveCount(0);
});
test("report status filters reset paging and archived view is read only", async ({
  page,
}) => {
  await auth(page);
  const report = {
    ...structuredClone(base),
    status: "SENT",
    archivedAt: "2026-10-19T08:00:00.000Z",
  };
  await page.route("**/api/v1/reports?**", (r) => {
    const pageNumber = Number(
      new URL(r.request().url()).searchParams.get("page"),
    );
    return r.fulfill({
      json: {
        data: [report],
        meta: { page: pageNumber, pageSize: 20, total: 21, totalPages: 2 },
      },
    });
  });
  await page.route(`**/api/v1/reports/${id}`, (r) =>
    r.fulfill({ json: { data: report } }),
  );
  await page.goto("/reports");
  await page.getByRole("button", { name: "Next reports" }).click();
  await expect(page.getByText("Report page 2 of 2")).toBeVisible();
  const filtered = page.waitForRequest(
    (r) => r.url().includes("reports?") && r.url().includes("status=SENT"),
  );
  await page.getByLabel("Report status").selectOption("SENT");
  expect(new URL((await filtered).url()).searchParams.get("page")).toBe("1");
  await page.getByRole("link", { name: "2026-10-14 report" }).click();
  await expect(page.getByText("Archived — read only")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reopen to edit" }),
  ).toHaveCount(0);
});
test("Facilitators are redirected before report requests", async ({ page }) => {
  await auth(page, "FACILITATOR");
  await page.route("**/api/v1/curriculum", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  let requests = 0;
  await page.route("**/api/v1/reports**", (r) => {
    requests++;
    return r.fulfill({ status: 403, json: {} });
  });
  for (const path of ["/reports", `/reports/${id}`]) {
    await page.goto(path);
    await expect(page).toHaveURL(/register-roundtable/);
  }
  expect(requests).toBe(0);
});

test("report list compares delivery states and contains mobile scrolling in both themes", async ({
  page,
}, testInfo) => {
  await auth(page);
  await page.route("**/api/v1/notifications/unread-count", (r) =>
    r.fulfill({ json: { data: { count: 0 } } }),
  );
  await page.route("**/api/v1/reports?**", (r) =>
    r.fulfill({
      json: {
        data: [
          base,
          {
            ...base,
            id: otherId,
            status: "SENT",
            sentAt: "2026-10-14T10:00:00.000Z",
            firstReadAt: "2026-10-14T11:00:00.000Z",
          },
        ],
        meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
      },
    }),
  );
  await page.goto("/reports");
  const region = page.getByRole("region", { name: "Reports list" });
  const assertSearchAlignment = async () => {
    const input = (await page
      .getByLabel("Search academic year", { exact: true })
      .boundingBox())!;
    const button = (await page
      .getByRole("button", { name: "Search reports", exact: true })
      .boundingBox())!;
    expect(Math.abs(input.y - button.y)).toBeLessThan(2);
    expect(Math.abs(input.height - button.height)).toBeLessThan(2);
    const select = page.getByLabel("Report status", { exact: true });
    expect(await select.evaluate((el) => getComputedStyle(el).appearance)).toBe(
      "none",
    );
    const icon = select.locator("..").locator("svg");
    const field = (await select.boundingBox())!;
    const arrow = (await icon.boundingBox())!;
    expect(
      field.x + field.width - arrow.x - arrow.width,
    ).toBeGreaterThanOrEqual(12);
    expect(
      Math.abs(field.y + field.height / 2 - arrow.y - arrow.height / 2),
    ).toBeLessThan(2);
  };
  await assertSearchAlignment();
  await expect(
    region.getByRole("columnheader", { name: "Read", exact: true }),
  ).toBeVisible();
  await expect(
    region.getByRole("cell", { name: "Not sent", exact: true }),
  ).toBeVisible();
  await expect(
    region.getByRole("cell", { name: "Read", exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("reports-desktop.png"),
    fullPage: true,
  });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await assertSearchAlignment();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      true,
    );
  }
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("reports-mobile-dark.png"),
    fullPage: true,
  });
});

test("builder section links target mounted editors and saving remains sticky", async ({
  page,
}, testInfo) => {
  await auth(page);
  await page.route(`**/api/v1/reports/${id}`, (r) =>
    r.fulfill({ json: { data: base } }),
  );
  await page.goto(`/reports/${id}`);
  const nav = page.getByRole("navigation", { name: "Report sections" });
  await expect(
    nav.getByRole("link", { name: "Opening summary" }),
  ).toHaveAttribute("href", `#report-section-${summaryId}`);
  await nav.getByRole("link", { name: "Session Highlights" }).click();
  await expect(
    page.locator(`#report-section-${highlightsId}`),
  ).toBeInViewport();
  await expect(
    page
      .getByRole("button", { name: "Save report", exact: true })
      .locator(".."),
  ).toHaveCSS("position", "sticky");
  const preview = page.getByRole("region", { name: "Preview current content" });
  const editor = page.locator(`#report-section-${summaryId}`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(preview).toBeVisible();
  const desktopEditor = await editor.boundingBox();
  const desktopPreview = await preview.boundingBox();
  expect(desktopPreview!.x).toBeGreaterThanOrEqual(
    desktopEditor!.x + desktopEditor!.width,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("builder-desktop.png"),
    fullPage: true,
  });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await preview.boundingBox())!.y).toBeGreaterThan(
      (await editor.boundingBox())!.y,
    );
  }
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.screenshot({
    path: testInfo.outputPath("builder-mobile-dark.png"),
    fullPage: true,
  });
});
