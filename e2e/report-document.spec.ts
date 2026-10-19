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
test("institutional preview keeps paper styling in both themes and contains A4 scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { ...structuredClone(base), status: "SENT" }, "SPONSOR");
  const paper = page.getByRole("article", {
    name: "Current report document",
    exact: true,
  });
  await expect(paper.getByText("RWANDA CODING ACADEMY")).toBeVisible();
  await expect(paper.getByText("Wednesday, 14th October 2026")).toBeVisible();
  await expect(
    paper.getByText("Sent version 1", { exact: true }),
  ).toBeVisible();
  await expect(paper.getByText("Saved summary")).toBeVisible();
  await paper.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      paper
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.evaluate(async () => {
    await document.fonts.load('11pt "Report Carlito"');
    await document.fonts.ready;
  });
  for (const dark of [false, true]) {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      dark,
    );
    await expect(paper).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(paper).toHaveCSS("color", "rgb(0, 0, 0)");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).include("article").analyze()).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/report-document-mobile-${dark ? "dark" : "light"}.png`,
      fullPage: true,
    });
  }
  await page.getByLabel("Use A4 page width").check();
  expect(
    await paper.evaluate((el) => el.getBoundingClientRect().width),
  ).toBeCloseTo(793.7, 0);
  const viewport = page.getByRole("region", {
    name: "Current report document preview",
    exact: true,
  });
  expect(await viewport.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await viewport.focus();
  await expect(viewport).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Use A4 page width").uncheck();
  await page.screenshot({
    path: "test-results/report-document-desktop.png",
    fullPage: true,
  });
});

test("draft preview renders unsaved text safely without saving or publishing", async ({
  page,
}) => {
  let writes = 0;
  await page.route(`**/api/v1/reports/${id}`, (r) => {
    if (r.request().method() !== "GET") writes++;
    return r.fulfill({ json: { data: base } });
  });
  await auth(page);
  await page.goto(`/reports/${id}`);
  await page.getByText("Preview current content", { exact: true }).click();
  await page
    .getByLabel("Opening summary text", { exact: true })
    .fill("<script>window.previewExecuted=true</script>");
  const paper = page.getByRole("article", {
    name: "Current report document",
    exact: true,
  });
  await expect(
    paper.getByText("<script>window.previewExecuted=true</script>", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    paper.getByText("Draft preview · Not sent", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "This preview includes unsaved edits. Save the report before downloading Word.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(() => Object.hasOwn(window, "previewExecuted")),
  ).toBe(false);
  expect(writes).toBe(0);
});
