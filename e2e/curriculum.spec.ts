import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { curriculumFixture } from "../tests/fixtures/curriculum";

const user = {
  id: "s",
  name: "Sponsor",
  email: "s@example.test",
  role: "SPONSOR",
  classYear: null,
  hasRoundtable: false,
  roundtableId: null,
};
async function session(page: Page, role = "SPONSOR") {
  await page.route("https://**/*", (r) => r.abort());
  await page.route("**/api/v1/**", (r) =>
    r.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "No fixture" } },
    }),
  );
  await page.route("**/api/v1/notifications/unread-count", (r) =>
    r.fulfill({ json: { data: { count: 0 } } }),
  );
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: { ...user, role } } }),
  );
}
const editor = (page: Page, level = "ICHOOSE", number = 1) =>
  page.getByRole("form", {
    name: `Edit ${level} lesson ${number}`,
    exact: true,
  });
test("Sponsor edits titles, preserves failed input and uses accessible mobile layouts", async ({
  page,
}) => {
  await session(page);
  let title = "Leadership",
    fail = true;
  await page.route("**/api/v1/curriculum", (r) =>
    r.fulfill({
      json: {
        ...curriculumFixture(title),
      },
    }),
  );
  await page.route("**/api/v1/curriculum/lessons/ICHOOSE-1", async (r) => {
    expect(r.request().method()).toBe("PATCH");
    expect(r.request().postDataJSON()).toEqual({ title: "Lead with care" });
    if (fail)
      return r.fulfill({
        status: 400,
        json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
      });
    title = "Lead with care";
    return r.fulfill({
      json: { data: { id: "ICHOOSE-1", number: 1, level: "ICHOOSE", title } },
    });
  });
  await page.goto("/curriculum");
  await page
    .getByRole("textbox", { name: "Lesson 1 title", exact: true })
    .fill("Lead with care");
  await page
    .getByRole("form", { name: "Edit ICHOOSE lesson 1", exact: true })
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Unavailable",
  );
  await expect(
    page.getByRole("textbox", { name: "Lesson 1 title", exact: true }),
  ).toHaveValue("Lead with care");
  fail = false;
  await page
    .getByRole("form", { name: "Edit ICHOOSE lesson 1", exact: true })
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByText("Lesson 1 saved.")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Lesson 1 title", exact: true }),
  ).toHaveValue(title);
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
  await session(page, "FACILITATOR");
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
  await expect(
    page.getByRole("textbox", { name: "Lesson 1 title", exact: true }),
  ).toHaveCount(0);
});

test("uncertain save retains text and unlocks only after a valid read without replaying PATCH", async ({
  page,
}) => {
  await session(page, "COORDINATOR");
  let title = "Leadership",
    failedRead = false,
    posts = 0;
  await page.route("**/api/v1/curriculum", (r) =>
    failedRead
      ? r.fulfill({ status: 503, json: {} })
      : r.fulfill({ json: curriculumFixture(title) }),
  );
  await page.route("**/api/v1/curriculum/lessons/ICHOOSE-1", (r) => {
    posts++;
    title = "Stored despite lost reply";
    return r.fulfill({ status: 503, json: {} });
  });
  await page.goto("/curriculum");
  const form = editor(page),
    input = form.getByRole("textbox");
  await input.fill("Retained desired title");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    form.getByText("Saving is unconfirmed.", { exact: false }),
  ).toBeVisible();
  await expect(input).toHaveValue("Retained desired title");
  await expect(input).toBeDisabled();
  failedRead = true;
  await form.getByRole("button", { name: "Check saved title" }).click();
  await expect(
    page.getByText("Last loaded curriculum is shown.", { exact: false }),
  ).toBeVisible();
  await expect(
    form.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  failedRead = false;
  await form.getByRole("button", { name: "Check saved title" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    form.getByText("Last loaded title: Stored despite lost reply", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    form.getByText("Saved title loaded above.", { exact: false }),
  ).toBeVisible();
  await expect(input).toHaveValue("Retained desired title");
  await expect(input).toBeEnabled();
  await expect(form.getByText("Lesson 1 saved.", { exact: true })).toHaveCount(
    0,
  );
  expect(posts).toBe(1);
});
for (const mismatch of ["title", "level"] as const) {
  test(`a mismatched ${mismatch} acknowledgement does not replace the draft or claim success`, async ({
    page,
  }) => {
    await session(page);
    await page.route("**/api/v1/curriculum", (r) =>
      r.fulfill({ json: curriculumFixture() }),
    );
    await page.route("**/api/v1/curriculum/lessons/ICHOOSE-1", (r) =>
      r.fulfill({
        json: {
          data: {
            id: "ICHOOSE-1",
            number: 1,
            title: "Desired wording",
            level: "ICHOOSE",
            [mismatch]: mismatch === "title" ? "Old wording" : "IDO",
          },
        },
      }),
    );
    await page.goto("/curriculum");
    const form = editor(page);
    await form.getByRole("textbox").fill("Desired wording");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      form.getByText("Saving is unconfirmed.", { exact: false }),
    ).toBeVisible();
    await expect(form.getByRole("textbox")).toHaveValue("Desired wording");
    await expect(
      form.getByText("Lesson 1 saved.", { exact: true }),
    ).toHaveCount(0);
  });
}
test("confirmed save stays confirmed after refresh failure and refresh retry only reads", async ({
  page,
}) => {
  await session(page);
  let failedRead = false,
    posts = 0,
    title = "Leadership";
  await page.route("**/api/v1/curriculum", (r) =>
    failedRead
      ? r.fulfill({ status: 503, json: {} })
      : r.fulfill({ json: curriculumFixture(title) }),
  );
  await page.route("**/api/v1/curriculum/lessons/ICHOOSE-1", (r) => {
    posts++;
    title = r.request().postDataJSON().title;
    failedRead = true;
    return r.fulfill({
      json: { data: { id: "ICHOOSE-1", number: 1, level: "ICHOOSE", title } },
    });
  });
  await page.goto("/curriculum");
  const form = editor(page);
  await form.getByRole("textbox").fill("Confirmed wording");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    form.getByText("Lesson 1 saved.", { exact: true }),
  ).toBeVisible();
  const retry = page.getByRole("button", {
    name: "Retry refreshing lesson views",
  });
  await expect(retry).toBeEnabled();
  failedRead = false;
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(
    form.getByText("Last loaded title: Confirmed wording", { exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
});
test("level switching preserves independent drafts and an uncertain save guard", async ({
  page,
}) => {
  await session(page);
  await page.route("**/api/v1/curriculum", (r) =>
    r.fulfill({ json: curriculumFixture() }),
  );
  await page.route("**/api/v1/curriculum/lessons/ICHOOSE-1", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/curriculum");
  await editor(page).getByRole("textbox").fill("iChoose draft");
  await page.getByLabel("Level", { exact: true }).selectOption("IDO");
  await editor(page, "IDO").getByRole("textbox").fill("iDo draft");
  await page.getByLabel("Level", { exact: true }).selectOption("ICHOOSE");
  await expect(editor(page).getByRole("textbox")).toHaveValue("iChoose draft");
  await editor(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    editor(page).getByText("Saving is unconfirmed.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Level", { exact: true }).selectOption("IDO");
  await expect(editor(page, "IDO").getByRole("textbox")).toHaveValue(
    "iDo draft",
  );
  await page.getByLabel("Level", { exact: true }).selectOption("ICHOOSE");
  await expect(
    editor(page).getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await expect(editor(page).getByRole("textbox")).toHaveValue("iChoose draft");
});
test("pending save blocks duplicate submits, other editors and level changes", async ({
  page,
}) => {
  await session(page);
  let release!: () => void,
    posts = 0;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/curriculum", (r) =>
    r.fulfill({ json: curriculumFixture() }),
  );
  await page.route("**/api/v1/curriculum/lessons/ICHOOSE-1", async (r) => {
    posts++;
    await pending;
    await r.fulfill({
      status: 400,
      json: { error: { code: "REJECTED", message: "Known rejection" } },
    });
  });
  await page.goto("/curriculum");
  const form = editor(page);
  await form.getByRole("textbox").fill("Retain while pending");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form.getByRole("textbox")).toBeDisabled();
  await expect(page.getByLabel("Level", { exact: true })).toBeDisabled();
  await expect(
    editor(page, "ICHOOSE", 2).getByRole("button", {
      name: "Save",
      exact: true,
    }),
  ).toBeDisabled();
  await form.evaluate((form) => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  expect(posts).toBe(1);
  release();
  await expect(
    form.getByText("Known rejection", { exact: true }),
  ).toBeVisible();
  await expect(form.getByRole("textbox")).toHaveValue("Retain while pending");
  await expect(form.getByRole("textbox")).toBeEnabled();
});
test("cached read failure preserves drafts and disables editing until a valid read", async ({
  page,
}) => {
  await session(page);
  await page.clock.install({ time: new Date("2026-10-21T09:00:00Z") });
  let failed = false;
  await page.route("**/api/v1/curriculum", (r) =>
    failed
      ? r.fulfill({ status: 503, json: {} })
      : r.fulfill({ json: curriculumFixture() }),
  );
  await page.goto("/curriculum");
  const form = editor(page);
  await form.getByRole("textbox").fill("Keep this draft");
  failed = true;
  await page.clock.fastForward(31000);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true })),
  );
  await expect(
    page.getByText("Last loaded curriculum is shown.", { exact: false }),
  ).toBeVisible();
  await expect(form.getByRole("textbox")).toHaveValue("Keep this draft");
  await expect(
    form.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  failed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(form.getByRole("textbox")).toBeEnabled();
  await expect(form.getByRole("textbox")).toHaveValue("Keep this draft");
});
test("incomplete curriculum is rejected before rendering title editors and can be retried", async ({
  page,
}) => {
  await session(page);
  let invalid = true;
  await page.route("**/api/v1/curriculum", (r) => {
    const value = curriculumFixture();
    if (invalid) value.data.levels[0]!.lessons.pop();
    return r.fulfill({ json: value });
  });
  await page.goto("/curriculum");
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Lesson 1 title", exact: true }),
  ).toHaveCount(0);
  invalid = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(editor(page).getByRole("textbox")).toBeEnabled();
});
test("identity replacement during reconciliation cannot discard the uncertain editor", async ({
  page,
}) => {
  await session(page);
  let replacement = false;
  await page.route("**/api/v1/curriculum", (r) => {
    const value = curriculumFixture();
    if (replacement) value.data.levels[0]!.lessons[0]!.id = "replacement";
    return r.fulfill({ json: value });
  });
  await page.route("**/api/v1/curriculum/lessons/ICHOOSE-1", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/curriculum");
  const form = editor(page);
  await form.getByRole("textbox").fill("Retained through replacement response");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    form.getByText("Saving is unconfirmed.", { exact: false }),
  ).toBeVisible();
  replacement = true;
  await form.getByRole("button", { name: "Check saved title" }).click();
  await expect(
    page.getByText("Last loaded curriculum is shown.", { exact: false }),
  ).toBeVisible();
  await expect(form.getByRole("textbox")).toHaveValue(
    "Retained through replacement response",
  );
  await expect(
    form.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  replacement = false;
  await form.getByRole("button", { name: "Check saved title" }).click();
  await expect(form.getByRole("textbox")).toBeEnabled();
});
for (const theme of ["light", "dark"] as const) {
  test(`320px ${theme} curriculum uncertainty supports keyboard recovery without overflow`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await session(page);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.route("**/api/v1/curriculum", (r) =>
      r.fulfill({ json: curriculumFixture() }),
    );
    await page.route("**/api/v1/curriculum/lessons/ICHOOSE-1", (r) =>
      r.fulfill({ status: 503, json: {} }),
    );
    await page.goto("/curriculum");
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark mode" }).click();
    const form = editor(page);
    await form.getByRole("textbox").fill("A retained title for mobile review");
    await form.getByRole("button", { name: "Save", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(
      form.getByText("Saving is unconfirmed.", { exact: false }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    const check = form.getByRole("button", { name: "Check saved title" });
    await check.focus();
    await page.screenshot({
      path: `artifacts/curriculum-uncertain-320-${theme}.png`,
      fullPage: false,
    });
    await page.keyboard.press("Enter");
    await expect(form.getByRole("textbox")).toBeEnabled();
    await expect(form.getByRole("textbox")).toBeFocused();
    await expect(form.getByRole("textbox")).toHaveValue(
      "A retained title for mobile review",
    );
  });
}
