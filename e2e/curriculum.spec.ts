import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const user = {
  id: "s",
  name: "Sponsor",
  email: "s@example.test",
  role: "SPONSOR",
  classYear: null,
  hasRoundtable: false,
  roundtableId: null,
};
test("Sponsor edits titles, preserves failed input and uses accessible mobile layouts", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: user } }),
  );
  let title = "Leadership",
    fail = true;
  await page.route("**/api/v1/curriculum", (r) =>
    r.fulfill({
      json: {
        data: {
          levels: [
            {
              key: "ICHOOSE",
              label: "iChoose",
              order: 1,
              lessons: [{ id: "lesson-1", number: 1, title }],
            },
          ],
        },
      },
    }),
  );
  await page.route("**/api/v1/curriculum/lessons/lesson-1", async (r) => {
    expect(r.request().method()).toBe("PATCH");
    expect(r.request().postDataJSON()).toEqual({ title: "Lead with care" });
    if (fail)
      return r.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
      });
    title = "Lead with care";
    return r.fulfill({
      json: { data: { id: "lesson-1", number: 1, level: "ICHOOSE", title } },
    });
  });
  await page.goto("/curriculum");
  await page.getByLabel("Lesson 1 title").fill("Lead with care");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "iLead is unavailable",
  );
  await expect(page.getByLabel("Lesson 1 title")).toHaveValue("Lead with care");
  fail = false;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Lesson 1 saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Lesson 1 title")).toHaveValue(title);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const mode of ["light", "dark"] as const) {
    if (mode === "dark")
      await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(page.locator("html")).toHaveClass(
      mode === "dark" ? /dark/ : /^(?!.*dark)/,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.screenshot({
    path: "artifacts/curriculum-mobile-dark.png",
    fullPage: true,
  });
});

test("Facilitator is redirected away from title editing", async ({ page }) => {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: { ...user, role: "FACILITATOR" } } }),
  );
  let requests = 0;
  await page.route("**/api/v1/curriculum", (r) => {
    requests++;
    return r.fulfill({ status: 403, json: {} });
  });
  await page.goto("/curriculum");
  await expect(page).toHaveURL(/register-roundtable/);
  // The registration screen legitimately fetches curriculum for its lesson dropdown.
  await expect(page.getByRole("heading", { name: /Register/i })).toBeVisible();
  expect(requests).toBeLessThanOrEqual(1);
  await expect(page.getByLabel("Lesson 1 title")).toHaveCount(0);
});
