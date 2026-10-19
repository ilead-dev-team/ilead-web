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

const template = {
  id: otherId,
  key: "custom_reflection",
  title: "Reflection",
  kind: "TEXT",
  autoSource: "NONE",
  isMandatory: false,
  isPreselected: false,
  isSystem: false,
  isArchived: false,
  position: 10,
};
const result = (data: unknown[], page = 1, totalPages = 1) => ({
  data,
  meta: { page, pageSize: 20, total: 21, totalPages },
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
  await page.goto(`/reports/${id}`);
  await expect(
    page.getByRole("heading", { name: "Session report", exact: true }),
  ).toBeVisible();
}
test("library paging and retry preserve report edits; insertion saves template identity and rejects duplicates", async ({
  page,
}) => {
  let fail = true;
  const pages: string[] = [];
  await page.route("**/api/v1/section-templates?**", (r) => {
    const url = new URL(r.request().url());
    pages.push(url.searchParams.get("page")!);
    expect(url.searchParams.get("isArchived")).toBe("false");
    if (fail)
      return r.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
      });
    return r.fulfill({
      json: result(
        url.searchParams.get("page") === "2"
          ? [template]
          : [
              {
                ...template,
                key: "summary",
                title: "Opening summary",
                isMandatory: true,
              },
            ],
        Number(url.searchParams.get("page")),
        2,
      ),
    });
  });
  let saved: Record<string, unknown>[] = [];
  let failSave = true;
  await page.route(`**/api/v1/reports/${id}/sections`, (r) => {
    saved = r.request().postDataJSON().sections;
    if (!failSave)
      return r.fulfill({
        json: {
          data: {
            ...base,
            sections: saved.map((input, index) => ({
              ...(base.sections[index] ?? {
                key: template.key,
                isMandatory: false,
                autoSource: "NONE",
              }),
              ...input,
              id: input.id ?? otherId,
              position: index + 1,
            })),
          },
        },
      });
    return r.fulfill({
      status: 503,
      json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
    });
  });
  await open(page);
  await page
    .getByLabel("Opening summary text", { exact: true })
    .fill("Keep this draft");
  await page
    .getByRole("button", { name: "Browse section library", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry section library", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Opening summary text", { exact: true }),
  ).toHaveValue("Keep this draft");
  fail = false;
  await page
    .getByRole("button", { name: "Retry section library", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Add library section Opening summary",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Next library sections", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Add library section Reflection",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Add library section Reflection",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.getByLabel("Reflection text", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByLabel("Reflection text", { exact: true })
    .fill("Written for this report");
  await page.getByRole("button", { name: "Save report", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "unavailable",
  );
  expect(saved.at(-1)).toEqual({
    templateKey: template.key,
    title: template.title,
    kind: "TEXT",
    content: { text: "Written for this report" },
  });
  await expect(page.getByLabel("Reflection text", { exact: true })).toHaveValue(
    "Written for this report",
  );
  await page
    .getByRole("button", { name: "Remove section Reflection", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Add library section Reflection",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("button", {
      name: "Add library section Reflection",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Reflection text", { exact: true })
    .fill("Persisted reflection");
  failSave = false;
  await page.getByRole("button", { name: "Save report", exact: true }).click();
  await expect(
    page.getByText("Saved report content", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Reflection text", { exact: true })
    .fill("Edited after save");
  await page.getByRole("button", { name: "Save report", exact: true }).click();
  await expect(
    page.getByText("Saved report content", { exact: true }),
  ).toBeVisible();
  expect(saved.at(-1)).toEqual({
    id: otherId,
    title: template.title,
    kind: "TEXT",
    content: { text: "Edited after save" },
  });
  expect(pages).toEqual(["1", "1", "2"]);
});
test("save-to-library retains failed metadata and creates only after opt-in; report still needs saving", async ({
  page,
}) => {
  let fail = true,
    malformed = false;
  const writes: unknown[] = [];
  await page.route("**/api/v1/section-templates", (r) => {
    writes.push(r.request().postDataJSON());
    if (fail)
      return r.fulfill({
        status: 409,
        json: { error: { code: "DUPLICATE", message: "Title already exists" } },
      });
    return r.fulfill({
      status: 201,
      json: { data: { ...template, isPreselected: malformed } },
    });
  });
  await page.route(`**/api/v1/reports/${id}/sections`, (r) =>
    r.fulfill({
      status: 503,
      json: {
        error: { code: "UNAVAILABLE", message: "Test save unavailable" },
      },
    }),
  );
  await open(page);
  await page.getByLabel("Section title", { exact: true }).fill("Reflection");
  await page
    .getByLabel("Save section structure to library", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Add custom section", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "already exists",
  );
  await expect(page.getByLabel("Section title", { exact: true })).toHaveValue(
    "Reflection",
  );
  await expect(page.getByLabel("Reflection text", { exact: true })).toHaveCount(
    0,
  );
  fail = false;
  malformed = true;
  await page
    .getByRole("button", { name: "Add custom section", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Something went wrong",
  );
  await expect(page.getByLabel("Section title", { exact: true })).toHaveValue(
    "Reflection",
  );
  malformed = false;
  await page
    .getByRole("button", { name: "Add custom section", exact: true })
    .click();
  await expect(
    page.getByLabel("Reflection text", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Section title", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByLabel("Save section structure to library", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByText("Unsaved report changes", { exact: true }),
  ).toBeVisible();
  expect(writes).toEqual(Array(3).fill({ title: "Reflection", kind: "TEXT" }));
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
  await page.screenshot({
    path: "test-results/report-library-mobile.png",
    fullPage: true,
  });
});
test("one-off custom section makes no library write and missing library options are recoverable", async ({
  page,
}) => {
  let writes = 0;
  await page.route("**/api/v1/section-templates**", (r) => {
    if (r.request().method() !== "GET") writes++;
    return r.fulfill({ json: result([], 1, 0) });
  });
  await page.route(`**/api/v1/reports/${id}/sections`, (r) =>
    r.fulfill({
      status: 503,
      json: {
        error: { code: "UNAVAILABLE", message: "Test save unavailable" },
      },
    }),
  );
  await open(page);
  await page
    .getByLabel("Section title", { exact: true })
    .fill("Only this report");
  await page
    .getByRole("button", { name: "Add custom section", exact: true })
    .click();
  await expect(
    page.getByLabel("Only this report text", { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(0);
  await page
    .getByRole("button", { name: "Browse section library", exact: true })
    .click();
  await expect(
    page.getByText("No available library sections.", { exact: true }),
  ).toBeVisible();
});
test("Sponsor, non-author and archived reports have no library authoring controls", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/v1/section-templates**", (r) => {
    calls++;
    return r.fulfill({ json: result([template]) });
  });
  for (const variant of ["sponsor", "non-author", "archived"]) {
    await page.unroute(`**/api/v1/reports/${id}`);
    const report = {
      ...structuredClone(base),
      status: variant === "sponsor" ? "SENT" : "DRAFT",
      author: { id: otherId, name: "Other Coordinator" },
      archivedAt: variant === "archived" ? "2026-10-19T10:00:00.000Z" : null,
    };
    await open(page, report, variant === "sponsor" ? "SPONSOR" : "COORDINATOR");
    await expect(
      page.getByRole("button", { name: "Browse section library", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Save section structure to library", { exact: true }),
    ).toHaveCount(0);
  }
  expect(calls).toBe(0);
});
