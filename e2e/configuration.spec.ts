import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
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
const section = {
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
