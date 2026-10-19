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

const createdId = "88888888-8888-4888-8888-888888888888";
function savedReport(inputs: Record<string, unknown>[]) {
  return {
    ...base,
    sections: inputs.map((input, index) => ({
      ...(base.sections.find((section) => section.id === input.id) ?? {
        key: null,
        isMandatory: false,
        autoSource: "NONE",
      }),
      ...input,
      id: input.id ?? createdId,
      position: index + 1,
    })),
  };
}
async function open(page: Page) {
  await auth(page);
  await page.route(`**/api/v1/reports/${id}`, (r) =>
    r.fulfill({ json: { data: base } }),
  );
  await page.goto(`/reports/${id}`);
  await expect(
    page.getByLabel("Opening summary text", { exact: true }),
  ).toBeVisible();
  await page.clock.install({ time: new Date("2026-10-19T10:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-19T10:00:01Z"));
}
test("autosave waits for five idle seconds, restarts after typing, and marks only acknowledged content saved", async ({
  page,
}) => {
  const writes: Record<string, unknown>[][] = [];
  await page.route(`**/api/v1/reports/${id}/sections`, (r) => {
    const input = r.request().postDataJSON().sections;
    writes.push(input);
    return r.fulfill({ json: { data: savedReport(input) } });
  });
  await open(page);
  const field = page.getByLabel("Opening summary text", { exact: true });
  await field.fill("First draft");
  await page.clock.fastForward(4999);
  expect(writes).toHaveLength(0);
  await field.fill("Latest draft");
  await page.clock.fastForward(4999);
  expect(writes).toHaveLength(0);
  await page.clock.fastForward(1);
  await expect(
    page.getByText("Saved report content", { exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]![0]!.content).toEqual({ text: "Latest draft" });
  await expect(page.getByText(/^Saved at /)).toBeVisible();
  await page.clock.fastForward(15000);
  expect(writes).toHaveLength(1);
});
test("blur saves immediately while late acknowledgements preserve newer edits and reuse new section IDs", async ({
  page,
}) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes: Record<string, unknown>[][] = [];
  await page.route(`**/api/v1/reports/${id}/sections`, async (r) => {
    const input = r.request().postDataJSON().sections;
    writes.push(input);
    if (writes.length === 1) await hold;
    return r.fulfill({ json: { data: savedReport(input) } });
  });
  await open(page);
  await page.getByLabel("Section title", { exact: true }).fill("Extra notes");
  await page
    .getByRole("button", { name: "Add custom section", exact: true })
    .click();
  const field = page.getByLabel("Extra notes text", { exact: true });
  await field.fill("Snapshot text");
  await page.getByLabel("Opening summary text", { exact: true }).focus();
  await expect.poll(() => writes.length).toBe(1);
  await expect(field).toBeEnabled();
  await field.fill("Newer text while saving");
  await expect(
    page.getByRole("button", { name: "Confirm report", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Remove section Extra notes",
      exact: true,
    }),
  ).toBeDisabled();
  await page.clock.fastForward(15000);
  expect(writes).toHaveLength(1);
  release();
  await expect(
    page.getByText("Earlier changes saved; newer edits are waiting to save.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Extra notes text", { exact: true }),
  ).toHaveValue("Newer text while saving");
  await expect(
    page.getByLabel("Extra notes text", { exact: true }),
  ).toBeFocused();
  await page.clock.fastForward(5000);
  await expect(
    page.getByText("Saved report content", { exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[1]!.at(-1)).toEqual({
    id: createdId,
    title: "Extra notes",
    kind: "TEXT",
    content: { text: "Newer text while saving" },
  });
  await expect(
    page.getByRole("button", { name: "Confirm report", exact: true }),
  ).toBeEnabled();
});
test("failed autosave pauses repeated writes and malformed acknowledgements preserve input until manual retry", async ({
  page,
}) => {
  let mode = "fail";
  const writes: Record<string, unknown>[][] = [];
  await page.route(`**/api/v1/reports/${id}/sections`, (r) => {
    const input = r.request().postDataJSON().sections;
    writes.push(input);
    if (mode === "fail")
      return r.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
      });
    return r.fulfill({
      json: { data: mode === "malformed" ? base : savedReport(input) },
    });
  });
  await open(page);
  const field = page.getByLabel("Opening summary text", { exact: true });
  await field.fill("Preserve me");
  await page.clock.fastForward(5000);
  await expect(page.getByText(/Not saved — autosave is paused/)).toBeVisible();
  await field.fill("Preserve newer edits too");
  await page.getByLabel("Bullet 1 text", { exact: true }).focus();
  await page.clock.fastForward(30000);
  expect(writes).toHaveLength(1);
  await expect(field).toHaveValue("Preserve newer edits too");
  await page.clock.resume();
  mode = "malformed";
  await page.getByRole("button", { name: "Save report", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Something went wrong",
  );
  await expect(field).toHaveValue("Preserve newer edits too");
  await page.clock.fastForward(15000);
  expect(writes).toHaveLength(2);
  mode = "ok";
  await page.getByRole("button", { name: "Save report", exact: true }).click();
  await expect(
    page.getByText("Saved report content", { exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(3);
  await expect(page.getByText(/Not saved — autosave is paused/)).toHaveCount(0);
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
    .getByText("Saved report content", { exact: true })
    .screenshot({ path: "test-results/report-autosave-saved.png" });
});
test("invalid section content stays local, then autosaves after correction; discard cancels pending save", async ({
  page,
}) => {
  let writes = 0;
  await page.route(`**/api/v1/reports/${id}/sections`, (r) => {
    writes++;
    return r.fulfill({
      json: { data: savedReport(r.request().postDataJSON().sections) },
    });
  });
  await open(page);
  await page.getByLabel("Section title", { exact: true }).fill("Extra notes");
  await page
    .getByRole("button", { name: "Add custom section", exact: true })
    .click();
  await page.getByLabel("Custom section title", { exact: true }).fill("");
  await page.clock.fastForward(5000);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Check section titles",
  );
  expect(writes).toBe(0);
  await page
    .getByLabel("Custom section title", { exact: true })
    .fill("Corrected notes");
  await page.clock.fastForward(5000);
  await expect(
    page.getByText("Saved report content", { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
  await page
    .getByLabel("Opening summary text", { exact: true })
    .fill("Discard this");
  await page
    .getByRole("button", { name: "Discard unsaved edits", exact: true })
    .click();
  await page.clock.fastForward(6000);
  expect(writes).toBe(1);
  await expect(
    page.getByLabel("Opening summary text", { exact: true }),
  ).toHaveValue("Saved summary");
});
