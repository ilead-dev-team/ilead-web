import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  id,
  row,
  attendance,
  trashed,
  meta,
} from "../tests/fixtures/roundtables";
const user = {
  id: "u",
  name: "Person",
  email: "p@example.test",
  role: "COORDINATOR",
  classYear: "YEAR_2",
  hasRoundtable: true,
  roundtableId: id,
};

test("Sponsor list labels zero and level-boundary progress and confines mobile table scrolling", async ({
  page,
}, testInfo) => {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: { ...user, role: "SPONSOR" } } }),
  );
  await page.route("**/api/v1/notifications/unread-count", (r) =>
    r.fulfill({ json: { data: { count: 0 } } }),
  );
  await page.route("**/api/v1/roundtables?**", (r) =>
    r.fulfill({
      json: {
        data: [
          {
            ...row,
            name: "New Circle",
            lastLesson: null,
            nextLesson: { ...row.nextLesson, number: 1 },
          },
          {
            ...row,
            id: "33333333-3333-4333-8333-333333333333",
            name: "Transition Circle",
            lastLesson: { ...row.lastLesson, number: 16 },
            nextLesson: { ...row.nextLesson, level: "IDO", number: 1 },
          },
        ],
        meta: { ...meta, total: 2 },
      },
    }),
  );
  await page.goto("/roundtables");
  await expect(
    page.getByRole("columnheader", { name: "Current level", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "iChoose: 0 of 16 lessons completed",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "iChoose: 16 of 16 lessons completed",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Actions", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("roundtables-desktop.png"),
    fullPage: true,
  });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const viewport = page.getByRole("region", {
      name: "Roundtables list",
      exact: true,
    });
    await expect(viewport).toHaveAttribute("tabindex", "0");
    expect(
      await viewport.evaluate((el) => el.scrollWidth > el.clientWidth),
    ).toBe(true);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("roundtables-mobile-dark.png"),
    fullPage: true,
  });
});
test("Coordinator filters, confirms trash, and handles restore failures", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: user } }),
  );
  let deleted = false,
    restoreFail = true;
  await page.route("**/api/v1/roundtables?**", (r) => {
    const params = new URL(r.request().url()).searchParams;
    return r.fulfill({
      json: {
        data: deleted ? [] : [row],
        meta: {
          page: Number(params.get("page")),
          pageSize: 20,
          total: deleted ? 0 : 21,
          totalPages: deleted ? 0 : 2,
        },
      },
    });
  });
  await page.route(`**/api/v1/roundtables/${id}`, (r) => {
    expect(r.request().method()).toBe("DELETE");
    deleted = true;
    return r.fulfill({ status: 204 });
  });
  await page.route("**/api/v1/roundtables/trash?**", (r) =>
    r.fulfill({
      json: {
        data: deleted
          ? [
              {
                ...row,
                facilitator: null,
                deletedAt: row.enrolledAt,
                purgeAfter: "2026-10-31T08:00:00.000Z",
              },
            ]
          : [],
        meta: {
          page: 1,
          pageSize: 20,
          total: deleted ? 1 : 0,
          totalPages: deleted ? 1 : 0,
        },
      },
    }),
  );
  await page.route(`**/api/v1/roundtables/${id}/restore`, (r) => {
    if (restoreFail)
      return r.fulfill({
        status: 409,
        json: {
          error: {
            code: "RESTORE_BLOCKED",
            message: "The Facilitator already has a replacement roundtable",
          },
        },
      });
    deleted = false;
    return r.fulfill({ json: { data: row } });
  });
  await page.goto("/roundtables");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  const filtered = page.waitForRequest(
    (r) =>
      r.url().includes("roundtables?") && r.url().includes("status=COMPLETED"),
  );
  await page.getByLabel("Status", { exact: true }).selectOption("COMPLETED");
  expect(new URL((await filtered).url()).searchParams.get("page")).toBe("1");
  await page
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  expect(deleted).toBe(false);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(deleted).toBe(false);
  await page
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm move to trash" }).click();
  await expect(page.getByText("No matching roundtables.")).toBeVisible();
  await page.getByRole("link", { name: "Open trash" }).click();
  await page.getByRole("button", { name: "Restore roundtable" }).click();
  await page.getByRole("button", { name: "Confirm restore" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Restore roundtable?" })
      .getByRole("alert"),
  ).toContainText("replacement roundtable");
  restoreFail = false;
  await page.getByRole("button", { name: "Confirm restore" }).click();
  await expect(page.getByText("No matching roundtables.")).toBeVisible();
});

test("Facilitator sees own histories and edits details without progress fields, preserving failed input", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: { ...user, role: "FACILITATOR" } } }),
  );
  let current = { ...row, facilitator: { ...row.facilitator, id: user.id } },
    fail = true;
  await page.route(`**/api/v1/roundtables/${id}`, (r) => {
    if (r.request().method() === "PATCH") {
      expect(r.request().postDataJSON()).toEqual({
        name: "Summits",
        slogan: row.slogan,
        classYear: "YEAR_2",
      });
      if (fail)
        return r.fulfill({
          status: 409,
          json: {
            error: {
              code: "ROUNDTABLE_NAME_SIMILAR",
              message: "Name is too similar",
            },
          },
        });
      current = { ...current, ...r.request().postDataJSON() };
      return r.fulfill({ json: { data: current } });
    }
    return r.fulfill({ json: { data: { ...current, attendance } } });
  });
  await page.route(`**/api/v1/roundtables/${id}/progress`, (r) =>
    r.fulfill({
      json: {
        data: {
          completed: [
            {
              lessonId: "l1",
              level: "ICHOOSE",
              number: 1,
              title: "Leadership",
              completedOn: null,
              sessionDate: null,
              source: "ENROLLMENT_BASELINE",
              recordedById: "u",
            },
            {
              lessonId: "l2",
              level: "ICHOOSE",
              number: 2,
              title: "Purpose",
              completedOn: "2026-10-14",
              sessionDate: "2026-10-14",
              source: "SESSION_ENTRY",
              recordedById: "c",
            },
          ],
        },
      },
    }),
  );
  await page.goto("/my-roundtable");
  await expect(page.getByText(/Before registration/)).toBeVisible();
  await expect(page.getByText("2026-10-14 · Met · Held session")).toBeVisible();
  await expect(page.getByLabel("Starting level")).toHaveCount(0);
  await page.getByLabel("Roundtable name", { exact: true }).fill("Summits");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Roundtable name", { exact: true })).toHaveValue(
    "Summits",
  );
  fail = false;
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("heading", { name: "Summits" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/roundtable-mobile-dark.png",
    fullPage: true,
  });
});

async function isolated(page: Page, role = "COORDINATOR") {
  const state = {
    current: {
      ...row,
      facilitator: {
        ...row.facilitator,
        id: role === "FACILITATOR" ? user.id : "f",
      },
    },
    live: true,
    listFails: false,
    detailFails: false,
    wrongDetail: false,
    wrongOwner: false,
    badTrash: false,
    progressReads: 0,
  };
  await page.route("https://**/*", (r) => r.abort());
  await page.route("**/api/v1/**", (r) =>
    r.fulfill({
      status: r.request().url().endsWith("/notifications/unread-count")
        ? 200
        : 404,
      json: r.request().url().endsWith("/notifications/unread-count")
        ? { data: { count: 0 } }
        : {
            error: {
              code: "NOT_FOUND",
              message: "Fixture endpoint unavailable",
            },
          },
    }),
  );
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: { ...user, role } } }),
  );
  await page.route("**/api/v1/roundtables?**", (r) =>
    r.fulfill(
      state.listFails
        ? { status: 503, json: {} }
        : {
            json: {
              data: state.live ? [state.current] : [],
              meta: {
                ...meta,
                total: state.live ? 1 : 0,
                totalPages: state.live ? 1 : 0,
              },
            },
          },
    ),
  );
  await page.route("**/api/v1/roundtables/trash?**", (r) =>
    r.fulfill(
      state.listFails
        ? { status: 503, json: {} }
        : {
            json: {
              data: state.live
                ? []
                : [
                    {
                      ...trashed,
                      name: state.current.name,
                      facilitator: state.badTrash
                        ? state.current.facilitator
                        : null,
                    },
                  ],
              meta: {
                ...meta,
                total: state.live ? 0 : 1,
                totalPages: state.live ? 0 : 1,
              },
            },
          },
    ),
  );
  await page.route(`**/api/v1/roundtables/${id}`, (r) =>
    r.fulfill(
      state.detailFails
        ? { status: 503, json: {} }
        : {
            json: {
              data: {
                ...state.current,
                id: state.wrongDetail
                  ? "11111111-1111-4111-8111-111111111111"
                  : id,
                facilitator: state.wrongOwner
                  ? { ...state.current.facilitator, id: "other" }
                  : state.current.facilitator,
                attendance,
              },
            },
          },
    ),
  );
  await page.route(`**/api/v1/roundtables/${id}/progress`, (r) => {
    state.progressReads++;
    return r.fulfill({ json: { data: { completed: [] } } });
  });
  return state;
}

test("unverified roundtable edit retains inputs and requires a matching saved-details read", async ({
  page,
}) => {
  const state = await isolated(page);
  let writes = 0;
  await page.route(`**/api/v1/roundtables/${id}`, (r) => {
    if (r.request().method() !== "PATCH") return r.fallback();
    writes++;
    state.current = { ...state.current, ...r.request().postDataJSON() };
    return r.fulfill({
      json: { data: { ...state.current, name: "Different acknowledgement" } },
    });
  });
  await page.goto(`/roundtables/${id}`);
  await page.getByLabel("Roundtable name", { exact: true }).fill("Summits");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(
    page.getByRole("button", { name: "Save details" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Roundtable name", { exact: true })).toHaveValue(
    "Summits",
  );
  await expect(
    page.getByText("Roundtable details saved.", { exact: true }),
  ).toHaveCount(0);
  state.wrongDetail = true;
  await page.getByRole("button", { name: "Check saved details" }).click();
  await expect(
    page.getByRole("button", { name: "Save details" }),
  ).toBeDisabled();
  state.wrongDetail = false;
  await page.getByRole("button", { name: "Check saved details" }).click();
  await expect(
    page.getByRole("button", { name: "Save details" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Summits", exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
});
test("pending edits ignore duplicate submissions and a confirmed edit retries only failed reads", async ({
  page,
}) => {
  const state = await isolated(page);
  let release!: () => void,
    writes = 0;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/v1/roundtables/${id}`, async (r) => {
    if (r.request().method() !== "PATCH") return r.fallback();
    writes++;
    state.current = { ...state.current, ...r.request().postDataJSON() };
    await pending;
    state.detailFails = true;
    return r.fulfill({ json: { data: state.current } });
  });
  await page.goto(`/roundtables/${id}`);
  await page.getByLabel("Roundtable name", { exact: true }).fill("Summits");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(
    page.getByLabel("Roundtable name", { exact: true }),
  ).toBeDisabled();
  await page
    .locator("form")
    .filter({ has: page.getByLabel("Roundtable name", { exact: true }) })
    .dispatchEvent("submit");
  expect(writes).toBe(1);
  release();
  await expect(
    page.getByText("Roundtable details saved.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry refreshing views" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save details" }),
  ).toBeDisabled();
  state.detailFails = false;
  await page.getByRole("button", { name: "Retry refreshing views" }).click();
  await expect(
    page.getByRole("button", { name: "Retry refreshing views" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Summits", exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
});
test("unverified trash result requires a successful list read before another reviewed attempt", async ({
  page,
}) => {
  const state = await isolated(page);
  let writes = 0;
  await page.route(`**/api/v1/roundtables/${id}`, (r) => {
    writes++;
    if (writes === 1) return r.fulfill({ json: { data: {} } });
    state.live = false;
    return r.fulfill({ status: 204 });
  });
  await page.goto("/roundtables");
  await page
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Move roundtable to trash?",
  });
  await dialog.getByRole("button", { name: "Confirm move to trash" }).click();
  await expect(
    dialog.getByRole("button", { name: "Confirm move to trash" }),
  ).toBeDisabled();
  state.listFails = true;
  await dialog.getByRole("button", { name: "Refresh roundtables" }).click();
  await expect(
    dialog.getByRole("button", { name: "Confirm move to trash" }),
  ).toBeDisabled();
  state.listFails = false;
  await dialog.getByRole("button", { name: "Refresh roundtables" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText("Roundtable moved to trash.", { exact: true }),
  ).toHaveCount(0);
  expect(writes).toBe(1);
  await page
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Confirm move to trash" }).click();
  await expect(
    page.getByText("Roundtable moved to trash.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No matching roundtables.")).toBeVisible();
  expect(writes).toBe(2);
});
test("lost restore acknowledgement refreshes the trash list without claiming the earlier action succeeded", async ({
  page,
}) => {
  const state = await isolated(page);
  state.live = false;
  let writes = 0;
  await page.route(`**/api/v1/roundtables/${id}/restore`, (r) => {
    writes++;
    state.live = true;
    return r.fulfill({ status: 503, json: {} });
  });
  await page.goto("/roundtables/trash");
  await page
    .getByRole("button", { name: "Restore roundtable", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Restore roundtable?" });
  await dialog.getByRole("button", { name: "Confirm restore" }).click();
  await expect(
    dialog.getByRole("button", { name: "Confirm restore" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Refresh roundtables" }).click();
  await expect(page.getByText("No matching roundtables.")).toBeVisible();
  await expect(
    page.getByText("Roundtable restored.", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Back to roundtables", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: row.name, exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
});

for (const trash of [false, true])
  test(`${trash ? "restore" : "trash"} review contains focus, restores it on Escape and blocks pending duplicate actions`, async ({
    page,
  }) => {
    const state = await isolated(page);
    state.live = !trash;
    let release!: () => void,
      writes = 0;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      `**/api/v1/roundtables/${id}${trash ? "/restore" : ""}`,
      async (r) => {
        writes++;
        await pending;
        state.live = trash;
        return r.fulfill(
          trash ? { json: { data: state.current } } : { status: 204 },
        );
      },
    );
    await page.goto(trash ? "/roundtables/trash" : "/roundtables");
    const trigger = page.getByRole("button", {
      name: trash ? "Restore roundtable" : "Move to trash",
      exact: true,
    });
    await trigger.click();
    const dialog = page.getByRole("dialog", {
      name: trash ? "Restore roundtable?" : "Move roundtable to trash?",
    });
    const confirm = dialog.getByRole("button", {
      name: trash ? "Confirm restore" : "Confirm move to trash",
    });
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await confirm.click();
    await expect(confirm).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await confirm.dispatchEvent("click");
    expect(writes).toBe(1);
    release();
    await expect(page.getByText("No matching roundtables.")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: trash ? "Roundtable trash" : "Roundtables",
        exact: true,
      }),
    ).toBeFocused();
    expect(writes).toBe(1);
  });

test("Facilitator detail refuses a different owner and never requests that record's progress", async ({
  page,
}) => {
  const state = await isolated(page, "FACILITATOR");
  state.wrongOwner = true;
  await page.goto("/my-roundtable");
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save details" })).toHaveCount(
    0,
  );
  expect(state.progressReads).toBe(0);
  state.wrongOwner = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save details" }),
  ).toBeVisible();
});
test("failed later roundtable pages offer Previous and trash rows must have a valid restore context", async ({
  page,
}) => {
  const state = await isolated(page);
  await page.route("**/api/v1/roundtables?**", (r) =>
    new URL(r.request().url()).searchParams.get("page") === "2"
      ? r.fulfill({ status: 503, json: {} })
      : r.fulfill({
          json: { data: [row], meta: { ...meta, total: 21, totalPages: 2 } },
        }),
  );
  await page.goto("/roundtables");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: row.name, exact: true }),
  ).toBeVisible();
  state.live = false;
  state.badTrash = true;
  await page.goto("/roundtables/trash");
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Restore roundtable", exact: true }),
  ).toHaveCount(0);
  state.badTrash = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Restore roundtable", exact: true }),
  ).toBeVisible();
});

for (const theme of ["light", "dark"])
  test(`roundtable trash and restore reviews support 320px keyboard layouts in ${theme} theme`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const state = await isolated(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.addInitScript(
      (theme) => localStorage.setItem("ilead-theme", theme),
      theme,
    );
    for (const trash of [false, true]) {
      state.live = !trash;
      await page.goto(trash ? "/roundtables/trash" : "/roundtables");
      await page
        .getByRole("button", {
          name: trash ? "Restore roundtable" : "Move to trash",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog", {
        name: trash ? "Restore roundtable?" : "Move roundtable to trash?",
      });
      await expect(
        dialog.getByRole("button", { name: "Cancel", exact: true }),
      ).toBeFocused();
      if (trash) await expect(dialog).toContainText("Kigali time");
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(
        true,
      );
      await dialog.getByRole("button", { name: "Cancel", exact: true }).focus();
      await page.screenshot({
        path: `test-results/roundtable-${trash ? "restore" : "trash"}-${theme}.png`,
        fullPage: false,
      });
    }
  });

test("Sponsor can inspect details but cannot edit or request trash", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ json: { data: { ...user, role: "SPONSOR" } } }),
  );
  await page.route(`**/api/v1/roundtables/${id}`, (r) =>
    r.fulfill({ json: { data: { ...row, attendance } } }),
  );
  await page.route(`**/api/v1/roundtables/${id}/progress`, (r) =>
    r.fulfill({ json: { data: { completed: [] } } }),
  );
  let trashCalls = 0;
  await page.route("**/api/v1/roundtables/trash?**", (r) => {
    trashCalls++;
    return r.fulfill({ status: 403 });
  });
  await page.route("**/api/v1/dashboard/**", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  await page.goto(`/roundtables/${id}`);
  await expect(page.getByRole("heading", { name: "Pinnacles" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save details" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Move to trash" })).toHaveCount(
    0,
  );
  await page.goto("/roundtables/trash");
  await expect(page).toHaveURL(/dashboard/);
  expect(trashCalls).toBe(0);
});
