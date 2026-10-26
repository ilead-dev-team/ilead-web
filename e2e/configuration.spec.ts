import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type {
  ConfigurationRecord,
  ConfigurationMode,
  Section,
} from "../src/lib/configuration";
test.beforeEach(async ({ page }) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "No fixture" } },
    }),
  );
  await page.route("**/api/v1/notifications/unread-count", (route) =>
    route.fulfill({ json: { data: { count: 0 } } }),
  );
});
const user = {
  id: "c",
  name: "Coordinator",
  email: "c@example.test",
  role: "COORDINATOR",
  classYear: null,
  hasRoundtable: false,
  roundtableId: null,
};
const activity = { id: "a", name: "Reflection", position: 0, isActive: true };
const section: Section = {
  id: "s",
  key: "system",
  title: "Progress",
  kind: "TABLE",
  autoSource: "PROGRESS",
  isMandatory: true,
  isPreselected: true,
  isSystem: true,
  isArchived: false,
  position: 0,
};
async function openEditors(page: Page) {
  const buttons = page.getByRole("button", {
    name: /^Edit (activity|section) /,
  });
  await expect(buttons.first()).toBeVisible();
  while (await buttons.count()) await buttons.first().click();
}
test("Coordinator maintains activities, retains failed edits and resets paging on filter", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: user } }),
  );
  let row = { ...activity },
    fail = true;
  await page.route("**/api/v1/activity-types?**", (r) => {
    const params = new URL(r.request().url()).searchParams;
    return r.fulfill({
      json: {
        data: [row],
        meta: {
          page: Number(params.get("page")),
          pageSize: 20,
          total: 21,
          totalPages: 2,
        },
      },
    });
  });
  await page.route("**/api/v1/activity-types/a", (r) => {
    expect(r.request().postDataJSON()).toEqual({
      name: "Discussion",
      position: 3,
      isActive: false,
    });
    if (fail)
      return r.fulfill({
        status: 409,
        json: {
          error: {
            code: "ACTIVITY_TYPE_NAME_TAKEN",
            message: "An activity with this name already exists.",
          },
        },
      });
    row = { ...row, ...r.request().postDataJSON() };
    return r.fulfill({ json: { data: row } });
  });
  await page.route("**/api/v1/activity-types", (r) => {
    expect(r.request().postDataJSON()).toEqual({ name: "New activity" });
    return r.fulfill({
      status: 201,
      json: { data: { ...activity, id: "new", name: "New activity" } },
    });
  });
  await page.goto("/settings/activities");
  await openEditors(page);
  await page.getByLabel("Activity name", { exact: true }).fill("Discussion");
  await page.getByLabel("Position", { exact: true }).fill("3");
  await page.getByRole("checkbox", { name: "Active", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Activity name", { exact: true })).toHaveValue(
    "Discussion",
  );
  fail = false;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Changes saved.")).toBeVisible();
  await page.getByLabel("New activity name").fill("New activity");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByLabel("New activity name")).toHaveValue("");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  const filtered = page.waitForRequest(
    (r) =>
      r.url().includes("activity-types?") && r.url().includes("isActive=false"),
  );
  await page.getByLabel("Show", { exact: true }).selectOption("false");
  expect(new URL((await filtered).url()).searchParams.get("page")).toBe("1");
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
    path: "artifacts/activities-mobile-dark.png",
    fullPage: true,
  });
});

test("section library protects system sections and creates, archives and restores custom sections", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: user } }),
  );
  let custom: typeof section | undefined,
    fail = true;
  await page.route("**/api/v1/section-templates?**", (r) =>
    r.fulfill({
      json: {
        data: custom ? [section, custom] : [section],
        meta: { page: 1, pageSize: 20, total: custom ? 2 : 1, totalPages: 1 },
      },
    }),
  );
  await page.route("**/api/v1/section-templates", (r) => {
    expect(r.request().postDataJSON()).toEqual({
      title: "Highlights",
      kind: "BULLETS",
    });
    if (fail)
      return r.fulfill({
        status: 409,
        json: {
          error: {
            code: "SECTION_TEMPLATE_TITLE_TAKEN",
            message: "Title already exists.",
          },
        },
      });
    custom = {
      ...section,
      id: "custom",
      key: "custom-key",
      title: "Highlights",
      kind: "BULLETS",
      autoSource: "NONE",
      isSystem: false,
      isMandatory: false,
      isPreselected: false,
    };
    return r.fulfill({ status: 201, json: { data: custom } });
  });
  const updates: unknown[] = [];
  await page.route("**/api/v1/section-templates/custom", (r) => {
    updates.push(r.request().postDataJSON());
    custom = { ...custom!, ...r.request().postDataJSON() };
    return r.fulfill({ json: { data: custom } });
  });
  await page.goto("/settings/sections");
  await openEditors(page);
  await expect(
    page.getByRole("form", { name: "Edit Progress" }).getByRole("checkbox"),
  ).toHaveCount(0);
  await page.getByLabel("New section title").fill("Highlights");
  await page.getByLabel("Section kind").selectOption("BULLETS");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("New section title")).toHaveValue("Highlights");
  fail = false;
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit section Highlights", exact: true })
    .click();
  const form = page.getByRole("form", { name: "Edit Highlights" });
  await form.getByRole("checkbox").uncheck();
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form.getByText("Changes saved.")).toBeVisible();
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => updates.length).toBe(2);
  expect(updates).toEqual([
    { title: "Highlights", isArchived: true },
    { title: "Highlights", isArchived: false },
  ]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "artifacts/sections-light.png",
    fullPage: true,
  });
});

test("Sponsor cannot request Coordinator settings data", async ({ page }) => {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: { ...user, role: "SPONSOR" } } }),
  );
  let calls = 0;
  await page.route(/\/api\/v1\/(activity-types|section-templates)/, (r) => {
    calls++;
    return r.fulfill({ status: 403, json: {} });
  });
  await page.route("**/api/v1/dashboard**", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  for (const path of ["activities", "sections"]) {
    await page.goto(`/settings/${path}`);
    await expect(page).toHaveURL(/dashboard/);
  }
  expect(calls).toBe(0);
});

const customSection: Section = {
  ...section,
  isSystem: false,
  isMandatory: false,
  isPreselected: false,
  autoSource: "NONE",
};
const modes = [
  {
    mode: "activities" as const,
    endpoint: "activity-types",
    row: activity,
    field: "Activity name",
    addField: "New activity name",
  },
  {
    mode: "sections" as const,
    endpoint: "section-templates",
    row: customSection,
    field: "Section title",
    addField: "New section title",
  },
];
async function records(
  page: Page,
  mode: ConfigurationMode,
  state: () => { rows: ConfigurationRecord[]; fail?: boolean },
) {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ json: { data: user } }),
  );
  await page.route(
    `**/api/v1/${mode === "activities" ? "activity-types" : "section-templates"}?**`,
    (route) => {
      const value = state();
      if (value.fail) return route.fulfill({ status: 503, json: {} });
      const params = new URL(route.request().url()).searchParams;
      const size = Number(params.get("pageSize")),
        index = Number(params.get("page"));
      let rows = value.rows;
      const filter = params.get(
        mode === "activities" ? "isActive" : "isArchived",
      );
      if (filter !== null)
        rows = rows.filter(
          (row) =>
            String("name" in row ? row.isActive : row.isArchived) === filter,
        );
      return route.fulfill({
        json: {
          data: rows.slice((index - 1) * size, index * size),
          meta: {
            page: index,
            pageSize: size,
            total: rows.length,
            totalPages: Math.ceil(rows.length / size),
          },
        },
      });
    },
  );
}
for (const scenario of modes) {
  const { mode, endpoint, field, addField } = scenario;
  test(`${mode}: uncertain edits retain input through failed and missing-record checks without replay`, async ({
    page,
  }) => {
    let row: ConfigurationRecord = { ...scenario.row },
      fail = false,
      missing = false,
      writes = 0;
    await records(page, mode, () => ({ rows: missing ? [] : [row], fail }));
    await page.route(`**/api/v1/${endpoint}/${row.id}`, (route) => {
      writes++;
      row = { ...row, ...route.request().postDataJSON() };
      return route.fulfill({ status: 503, json: {} });
    });
    await page.goto(`/settings/${mode}`);
    await openEditors(page);
    const form = page.getByRole("form", {
      name: `Edit ${"name" in row ? row.name : row.title}`,
      exact: true,
    });
    const input = form.getByLabel(field, { exact: true });
    await input.fill("Retained revision");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      form.getByText("Saving is unconfirmed.", { exact: false }),
    ).toBeVisible();
    await expect(input).toHaveValue("Retained revision");
    await expect(input).toBeDisabled();
    await expect(page.getByLabel("Show", { exact: true })).toBeDisabled();
    fail = true;
    await form.getByRole("button", { name: "Check saved records" }).click();
    await expect(
      form.getByRole("button", { name: "Check saved records" }),
    ).toBeEnabled();
    await expect(input).toBeDisabled();
    fail = false;
    missing = true;
    await form.getByRole("button", { name: "Check saved records" }).click();
    await expect(
      form.getByRole("button", { name: "Check saved records" }),
    ).toBeEnabled();
    await expect(input).toBeDisabled();
    missing = false;
    row =
      "name" in row
        ? { ...row, name: "Current server value" }
        : { ...row, title: "Current server value" };
    await form.getByRole("button", { name: "Check saved records" }).click();
    await expect(input).toBeEnabled();
    await expect(input).toBeFocused();
    await expect(
      form.getByText("Last loaded:", { exact: false }),
    ).toContainText("Current server value");
    await expect(input).toHaveValue("Retained revision");
    await expect(form.getByText("Changes saved.")).toHaveCount(0);
    await form.getByRole("button", { name: "Discard edits" }).click();
    await expect(page.getByLabel(field, { exact: true })).toHaveValue(
      "Current server value",
    );
    await expect(page.getByLabel("Show", { exact: true })).toBeEnabled();
    expect(writes).toBe(1);
  });
  test(`${mode}: lost creation acknowledgement checks every page without repeating POST`, async ({
    page,
  }) => {
    const rows: ConfigurationRecord[] = Array.from(
      { length: 100 },
      (_, index) =>
        "name" in scenario.row
          ? {
              ...scenario.row,
              id: `old-${index}`,
              name: `Activity ${index}`,
              position: index,
            }
          : {
              ...scenario.row,
              id: `old-${index}`,
              title: `Section ${index}`,
              key: `key-${index}`,
              position: index,
            },
    );
    let writes = 0;
    const checkedPages: number[] = [];
    await records(page, mode, () => ({ rows }));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.pathname.endsWith(endpoint) &&
        url.searchParams.get("pageSize") === "100"
      )
        checkedPages.push(Number(url.searchParams.get("page")));
    });
    await page.route(`**/api/v1/${endpoint}`, (route) => {
      writes++;
      rows.push({
        ...scenario.row,
        ...route.request().postDataJSON(),
        id: "created",
        position: 100,
      });
      return route.fulfill({ status: 502, json: {} });
    });
    await page.goto(`/settings/${mode}`);
    await openEditors(page);
    const form = page.getByRole("form", { name: "Add configuration" });
    await form.getByLabel(addField).fill("New addition");
    if (mode === "sections")
      await form.getByLabel("Section kind").selectOption("BULLETS");
    await form.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      form.getByText("Adding is unconfirmed.", { exact: false }),
    ).toBeVisible();
    await expect(
      form.getByRole("button", { name: "Add", exact: true }),
    ).toBeDisabled();
    await form.getByRole("button", { name: "Check saved records" }).click();
    await expect(form.getByRole("status")).toContainText(
      "A record named “New addition” is present",
    );
    await expect(form.getByLabel(addField)).toHaveValue("New addition");
    if (mode === "sections")
      await expect(form.getByLabel("Section kind")).toHaveValue("BULLETS");
    await expect(form.getByText("Added successfully.")).toHaveCount(0);
    expect(checkedPages).toEqual([1, 2]);
    await form.getByRole("button", { name: "Discard addition" }).click();
    await expect(page.getByText("Page 1 of 6", { exact: true })).toBeVisible();
    expect(writes).toBe(1);
  });
  test(`${mode}: mismatched save acknowledgements cannot report success`, async ({
    page,
  }) => {
    await records(page, mode, () => ({ rows: [scenario.row] }));
    await page.route(`**/api/v1/${endpoint}/${scenario.row.id}`, (route) =>
      route.fulfill({
        json: {
          data:
            mode === "activities"
              ? {
                  ...scenario.row,
                  ...route.request().postDataJSON(),
                  position: 99,
                }
              : {
                  ...scenario.row,
                  ...route.request().postDataJSON(),
                  isMandatory: true,
                },
        },
      }),
    );
    await page.goto(`/settings/${mode}`);
    await openEditors(page);
    const form = page.getByRole("form", {
      name: `Edit ${"name" in scenario.row ? scenario.row.name : scenario.row.title}`,
      exact: true,
    });
    await form.getByLabel(field, { exact: true }).fill("Desired title");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      form.getByText("Saving is unconfirmed.", { exact: false }),
    ).toBeVisible();
    await expect(form.getByLabel(field, { exact: true })).toHaveValue(
      "Desired title",
    );
    await expect(form.getByText("Changes saved.")).toHaveCount(0);
  });
  test(`${mode}: confirmed saves survive refresh failure and refresh retry only reads`, async ({
    page,
  }) => {
    let row: ConfigurationRecord = { ...scenario.row },
      fail = false,
      writes = 0;
    await records(page, mode, () => ({ rows: [row], fail }));
    await page.route(`**/api/v1/${endpoint}/${row.id}`, (route) => {
      writes++;
      row = { ...row, ...route.request().postDataJSON() };
      fail = true;
      return route.fulfill({ json: { data: row } });
    });
    await page.goto(`/settings/${mode}`);
    await openEditors(page);
    const form = page.getByRole("form", {
      name: `Edit ${"name" in row ? row.name : row.title}`,
      exact: true,
    });
    await form.getByLabel(field, { exact: true }).fill("Confirmed title");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(form.getByText("Changes saved.")).toBeVisible();
    await expect(
      page.getByText("Last loaded records are shown.", { exact: false }),
    ).toBeVisible();
    await expect(
      form.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();
    const retry = page.getByRole("button", {
      name: "Retry refreshing records",
    });
    await expect(retry).toBeEnabled();
    fail = false;
    await retry.click();
    await expect(retry).toHaveCount(0);
    await expect(
      page.getByText("Changes saved.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(field, { exact: true })).toHaveValue(
      "Confirmed title",
    );
    expect(writes).toBe(1);
  });
  test(`${mode}: keyboard errors focus their fields and 320px themes remain accessible`, async ({
    page,
  }) => {
    const row: ConfigurationRecord =
      "name" in scenario.row
        ? { ...scenario.row, name: "A".repeat(200) }
        : { ...scenario.row, title: "S".repeat(120) };
    await records(page, mode, () => ({ rows: [row] }));
    await page.goto(`/settings/${mode}`);
    await openEditors(page);
    const input = page.getByLabel(field, { exact: true });
    await input.fill(" ");
    await input.press("Enter");
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    const errorId = await input.getAttribute("aria-describedby");
    await expect(page.locator(`#${errorId}`)).toBeVisible();
    if (mode === "activities") {
      await input.fill("Valid title");
      const order = page.getByLabel("Position", { exact: true });
      await order.fill("");
      await order.press("Enter");
      await expect(order).toBeFocused();
      await expect(order).toHaveAttribute("aria-invalid", "true");
    }
    await page.getByRole("button", { name: "Discard edits" }).click();
    await page.setViewportSize({ width: 320, height: 780 });
    for (const theme of ["light", "dark"] as const) {
      if (theme === "dark")
        await page.getByRole("button", { name: "Switch to dark mode" }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `artifacts/configuration-${mode}-${theme}.png`,
        fullPage: true,
      });
    }
  });
}
test("pending edits reject duplicate submits and block other records, creation and navigation", async ({
  page,
}) => {
  let row = { ...activity },
    writes = 0,
    release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await records(page, "activities", () => ({
    rows: [row, { ...activity, id: "b", name: "Other" }],
  }));
  await page.route("**/api/v1/activity-types/a", async (route) => {
    writes++;
    await pending;
    row = { ...row, ...route.request().postDataJSON() };
    return route.fulfill({ json: { data: row } });
  });
  await page.goto("/settings/activities");
  await openEditors(page);
  const form = page.getByRole("form", { name: "Edit Reflection", exact: true });
  await form.getByLabel("Activity name", { exact: true }).fill("Edited");
  try {
    await form.evaluate((element) => {
      (element as HTMLFormElement).requestSubmit();
      (element as HTMLFormElement).requestSubmit();
    });
    await expect(form.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await expect(
      page
        .getByRole("form", { name: "Edit Other", exact: true })
        .getByRole("textbox"),
    ).toBeDisabled();
    await expect(page.getByLabel("New activity name")).toBeDisabled();
    await expect(page.getByLabel("Show", { exact: true })).toBeDisabled();
    expect(writes).toBe(1);
  } finally {
    release();
  }
  await expect(page.getByText("Changes saved.")).toBeVisible();
  expect(writes).toBe(1);
});

test("failed later pages allow returning to a readable page without enabling stale writes", async ({
  page,
}) => {
  const rows = Array.from({ length: 21 }, (_, index) => ({
    ...activity,
    id: `a-${index}`,
    name: `Activity ${index}`,
  }));
  await records(page, "activities", () => ({ rows }));
  await page.route("**/api/v1/activity-types?**", (route) =>
    new URL(route.request().url()).searchParams.get("page") === "2"
      ? route.fulfill({ status: 503, json: {} })
      : route.fallback(),
  );
  await page.goto("/settings/activities");
  await openEditors(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Edit activity Activity 0", exact: true })
    .click();
  await expect(
    page
      .getByRole("form", { name: "Edit Activity 0", exact: true })
      .getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
});
