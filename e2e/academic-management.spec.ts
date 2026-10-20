import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  calendar,
  savedYear,
  currentYear,
  meta,
} from "../tests/fixtures/academic-management";
type Year = typeof savedYear;
async function setup(page: Page, role = "COORDINATOR") {
  const calls: { path: string; method: string; body: unknown }[] = [];
  const rows: Year[] = [structuredClone(savedYear)];
  let current: Year | null = structuredClone(currentYear);
  await page.route("**/api/v1/**", (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace("/api/v1", "");
    const body = req.postData() ? req.postDataJSON() : null;
    calls.push({ path: path + url.search, method: req.method(), body });
    if (path === "/auth/me")
      return route.fulfill({
        json: {
          data: {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            name: "Ada",
            email: "ada@example.test",
            role,
            classYear: null,
            hasRoundtable: false,
            roundtableId: null,
          },
        },
      });
    if (path === "/notifications/unread-count")
      return route.fulfill({ json: { data: { count: 0 } } });
    if (path === "/push/subscriptions")
      return route.fulfill({ json: { data: [] } });
    if (path === "/academic-years/current")
      return current
        ? route.fulfill({ json: { data: current } })
        : route.fulfill({
            status: 404,
            json: {
              error: {
                code: "CURRENT_ACADEMIC_YEAR_NOT_FOUND",
                message: "No current academic year",
              },
            },
          });
    if (path === "/academic-years" && req.method() === "GET") {
      const requested = Number(url.searchParams.get("page"));
      return route.fulfill({
        json: {
          data: requested === 1 ? rows : [],
          meta: {
            ...meta,
            page: requested,
            total: rows.length,
            totalPages: Math.ceil(rows.length / 20),
          },
        },
      });
    }
    if (path === "/academic-years" && req.method() === "POST") {
      if (rows.some((row) => row.label === body.label))
        return route.fulfill({
          status: 409,
          json: {
            error: {
              code: "CALENDAR_CONFLICT",
              message: "Academic year label already exists",
            },
          },
        });
      const row = {
        ...body,
        id: "44444444-4444-4444-8444-444444444444",
        isCurrent: false,
        terms: body.terms.map((t: object, i: number) => ({
          ...t,
          id: `${i + 1}5555555-5555-4555-8555-555555555555`,
        })),
      };
      delete row.makeCurrent;
      rows.unshift(row);
      return route.fulfill({ status: 201, json: { data: row } });
    }
    if (path.startsWith("/academic-years/") && req.method() === "PATCH") {
      const row = rows.find((row) => path.endsWith(row.id))!;
      if (body.makeCurrent) {
        rows.forEach((y) => {
          y.isCurrent = y.id === row.id;
        });
        current = row;
      }
      for (const key of ["label", "startsOn", "endsOn"] as const)
        if (body[key] !== undefined) row[key] = body[key];
      if (body.terms)
        row.terms = body.terms.map((t: { number: number }) => ({
          ...t,
          id: row.terms.find((old) => old.number === t.number)!.id,
        }));
      return route.fulfill({ json: { data: row } });
    }
    return route.fulfill({
      status: 404,
      json: {
        error: { code: "NOT_FOUND", message: "Fixture endpoint missing" },
      },
    });
  });
  return {
    calls,
    rows,
    noCurrent: () => {
      current = null;
    },
  };
}
const form = (page: Page) =>
  page.getByRole("region", { name: /^(New|Edit) academic year$/ });
const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "Review calendar changes", exact: true });
async function fillCalendar(page: Page, label = "New NESA year") {
  await page.getByLabel("Year label", { exact: true }).fill(label);
  await page
    .getByLabel("Year start date", { exact: true })
    .fill(calendar.startsOn);
  await page.getByLabel("Year end date", { exact: true }).fill(calendar.endsOn);
  for (const t of calendar.terms) {
    await page
      .getByLabel(`Term ${t.number} name`, { exact: true })
      .fill(t.name);
    await page
      .getByLabel(`Term ${t.number} start date`, { exact: true })
      .fill(t.startsOn);
    await page
      .getByLabel(`Term ${t.number} end date`, { exact: true })
      .fill(t.endsOn);
  }
}
test("create reviews exactly three terms before writing an inactive year and restores focus", async ({
  page,
}) => {
  const f = await setup(page);
  await page.goto("/settings/academic-years");
  await page
    .getByRole("button", { name: "Add academic year", exact: true })
    .click();
  await fillCalendar(page);
  await form(page)
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await expect(dialog(page)).toContainText(
    "will not become current automatically",
  );
  expect(f.calls.some((c) => c.method === "POST")).toBe(false);
  await dialog(page)
    .getByRole("button", { name: "Save academic year", exact: true })
    .click();
  await expect(page.getByText(/New NESA year saved/)).toBeVisible();
  expect(f.calls.find((c) => c.method === "POST")!.body).toEqual({
    ...calendar,
    label: "New NESA year",
    makeCurrent: false,
  });
  await expect(
    page.getByRole("article", {
      name: "Academic year New NESA year",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add academic year", exact: true }),
  ).toBeFocused();
});
test("invalid dates and overlapping boundaries never reach review or write", async ({
  page,
}) => {
  const f = await setup(page);
  await page.goto("/settings/academic-years");
  await page
    .getByRole("button", { name: "Add academic year", exact: true })
    .click();
  await fillCalendar(page);
  await page
    .getByLabel("Term 2 start date", { exact: true })
    .fill(calendar.terms[0]!.endsOn);
  await form(page)
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await expect(form(page).getByText(/without overlapping/)).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  await page
    .getByLabel("Term 2 start date", { exact: true })
    .fill(calendar.terms[1]!.startsOn);
  await page.getByLabel("Year end date", { exact: true }).fill("2025-01-01");
  await form(page)
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await expect(form(page).getByText(/year must end on or after/)).toBeVisible();
  expect(f.calls.some((c) => c.method === "POST")).toBe(false);
});
test("session conflicts preserve edits; successful PATCH contains only changed calendar fields", async ({
  page,
}) => {
  const f = await setup(page);
  let fail = true;
  await page.route(`**/api/v1/academic-years/${savedYear.id}`, (r) =>
    fail
      ? r.fulfill({
          status: 409,
          json: {
            error: {
              code: "CALENDAR_HAS_SESSIONS",
              message: "Calendar changes would exclude an existing session",
            },
          },
        })
      : r.fallback(),
  );
  await page.goto("/settings/academic-years");
  await page
    .getByRole("button", { name: `Edit ${savedYear.label}`, exact: true })
    .click();
  await page.getByLabel("Term 3 end date", { exact: true }).fill("2027-07-14");
  await form(page)
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await dialog(page)
    .getByRole("button", { name: "Save academic year", exact: true })
    .click();
  await expect(dialog(page).getByRole("alert")).toContainText(
    "existing session",
  );
  await dialog(page)
    .getByRole("button", { name: "Cancel review", exact: true })
    .click();
  await expect(page.getByLabel("Term 3 end date", { exact: true })).toHaveValue(
    "2027-07-14",
  );
  fail = false;
  await page.getByLabel("Term 3 end date", { exact: true }).fill("2027-07-16");
  await form(page)
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await dialog(page)
    .getByRole("button", { name: "Save academic year", exact: true })
    .click();
  await expect(
    page.getByText(`${savedYear.label} saved.`, { exact: true }),
  ).toBeVisible();
  const body = f.calls.find((c) => c.method === "PATCH")!.body as {
    terms: object[];
  };
  expect(Object.keys(body)).toEqual(["terms"]);
  expect(body.terms).toHaveLength(3);
  expect(body.terms.every((t) => !("id" in t))).toBe(true);
});
test("current-year switch requires review and sends only makeCurrent", async ({
  page,
}) => {
  const f = await setup(page);
  await page.goto("/settings/academic-years");
  await page
    .getByRole("button", {
      name: `Set ${savedYear.label} current`,
      exact: true,
    })
    .click();
  await expect(dialog(page)).toContainText(
    `from ${currentYear.label} to ${savedYear.label}`,
  );
  expect(f.calls.some((c) => c.method === "PATCH")).toBe(false);
  await dialog(page)
    .getByRole("button", { name: "Set current year", exact: true })
    .click();
  await expect(
    page.getByText(/is now the current academic year/),
  ).toBeVisible();
  expect(f.calls.find((c) => c.method === "PATCH")!.body).toEqual({
    makeCurrent: true,
  });
  await expect(
    page.getByRole("region", { name: "Current academic year", exact: true }),
  ).toContainText(savedYear.label);
  expect(
    f.calls.filter((c) => c.path === "/academic-years/current").length,
  ).toBeGreaterThan(1);
});
test("unconfirmed save blocks repeat writes until explicit refresh and preserves form values", async ({
  page,
}) => {
  const f = await setup(page);
  let writes = 0;
  await page.route("**/api/v1/academic-years", (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    writes++;
    const { makeCurrent: _makeCurrent, ...body } = r.request().postDataJSON();
    void _makeCurrent;
    f.rows.unshift({
      ...savedYear,
      ...body,
      id: "44444444-4444-4444-8444-444444444444",
      isCurrent: false,
      terms: savedYear.terms,
    });
    return r.fulfill({
      status: 201,
      json: { data: { ...savedYear, label: "Wrong acknowledgement" } },
    });
  });
  await page.goto("/settings/academic-years");
  await page
    .getByRole("button", { name: "Add academic year", exact: true })
    .click();
  await fillCalendar(page, "Unconfirmed year");
  await form(page)
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await dialog(page)
    .getByRole("button", { name: "Save academic year", exact: true })
    .click();
  await expect(dialog(page).getByRole("alert")).toContainText(
    "could not be verified",
  );
  await expect(
    dialog(page).getByRole("button", {
      name: "Save academic year",
      exact: true,
    }),
  ).toBeDisabled();
  expect(writes).toBe(1);
  await dialog(page)
    .getByRole("button", { name: "Refresh years before retrying", exact: true })
    .click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByLabel("Year label", { exact: true })).toHaveValue(
    "Unconfirmed year",
  );
  await expect(
    page.getByRole("article", {
      name: "Academic year Unconfirmed year",
      exact: true,
    }),
  ).toBeVisible();
  expect(writes).toBe(1);
});
test("refresh rebases untouched server fields while preserving local term edits", async ({
  page,
}) => {
  const f = await setup(page);
  await page.goto("/settings/academic-years");
  await page
    .getByRole("button", { name: `Edit ${savedYear.label}`, exact: true })
    .click();
  await page.getByLabel("Term 1 name", { exact: true }).fill("My unsaved name");
  f.rows[0]!.label = "Fresh server label";
  await page
    .getByRole("button", { name: "Refresh years", exact: true })
    .click();
  await expect(page.getByLabel("Year label", { exact: true })).toHaveValue(
    "Fresh server label",
  );
  await expect(page.getByLabel("Term 1 name", { exact: true })).toHaveValue(
    "My unsaved name",
  );
});
test("paging and sort use bounded API filters; list errors retain the open form", async ({
  page,
}) => {
  await setup(page);
  let fail = false;
  const queries: URL[] = [];
  await page.route("**/api/v1/academic-years?**", (r) => {
    const url = new URL(r.request().url());
    queries.push(url);
    if (fail)
      return r.fulfill({
        status: 503,
        json: { error: { message: "Unavailable" } },
      });
    return r.fulfill({
      json: {
        data: Number(url.searchParams.get("page")) === 1 ? [savedYear] : [],
        meta: {
          ...meta,
          page: Number(url.searchParams.get("page")),
          total: 21,
          totalPages: 2,
        },
      },
    });
  });
  await page.goto("/settings/academic-years");
  await page.getByRole("button", { name: "Next years", exact: true }).click();
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await page.getByLabel("Sort academic years").selectOption("label:asc");
  await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Add academic year", exact: true })
    .click();
  await page.getByLabel("Year label", { exact: true }).fill("Keep my input");
  fail = true;
  await page
    .getByRole("button", { name: "Refresh years", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry years", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Year label", { exact: true })).toHaveValue(
    "Keep my input",
  );
  expect(queries.some((q) => q.searchParams.get("page") === "2")).toBe(true);
  expect(queries.every((q) => q.searchParams.get("pageSize") === "20")).toBe(
    true,
  );
  expect(queries.at(-1)!.searchParams.get("sort")).toBe("label:asc");
  expect(queries.at(-1)!.searchParams.get("page")).toBe("1");
});
test("no-current state is explicit and review cancellation restores keyboard focus", async ({
  page,
}) => {
  const f = await setup(page);
  f.noCurrent();
  await page.goto("/settings/academic-years");
  await expect(
    page.getByText(/No current academic year is configured/),
  ).toBeVisible();
  const trigger = page.getByRole("button", {
    name: `Set ${savedYear.label} current`,
    exact: true,
  });
  await trigger.click();
  const cancel = dialog(page).getByRole("button", {
    name: "Cancel review",
    exact: true,
  });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog(page).getByRole("button", { name: "Set current year", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
test("pending calendar writes cannot be dismissed or sent twice", async ({
  page,
}) => {
  await setup(page);
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  await page.route(`**/api/v1/academic-years/${savedYear.id}`, async (r) => {
    writes++;
    await waiting;
    await r.fallback();
  });
  await page.goto("/settings/academic-years");
  await page
    .getByRole("button", {
      name: `Set ${savedYear.label} current`,
      exact: true,
    })
    .click();
  await dialog(page)
    .getByRole("button", { name: "Set current year", exact: true })
    .click();
  await expect(
    dialog(page).getByRole("button", { name: "Set current year", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog(page).getByRole("button", { name: "Cancel review", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeVisible();
  expect(writes).toBe(1);
  release();
  await expect(dialog(page)).toHaveCount(0);
});
test("slow calendar reads show loading before real empty data and failures offer retry", async ({
  page,
}) => {
  await setup(page);
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/academic-years?**", async (r) => {
    await waiting;
    await r.fulfill({
      status: 503,
      json: { error: { message: "Unavailable" } },
    });
  });
  await page.goto("/settings/academic-years");
  const list = page.getByRole("region", {
    name: "Saved academic years",
    exact: true,
  });
  await expect(
    list.getByText("Connecting to iLead…", { exact: true }),
  ).toBeVisible();
  await expect(list.getByText("No academic years on this page.")).toHaveCount(
    0,
  );
  release();
  await expect(
    list.getByRole("button", { name: "Retry years", exact: true }),
  ).toBeVisible();
  await page.route("**/api/v1/academic-years?**", (r) =>
    r.fulfill({
      json: { data: [], meta: { ...meta, total: 0, totalPages: 0 } },
    }),
  );
  await list.getByRole("button", { name: "Retry years", exact: true }).click();
  await expect(list.getByText("No academic years on this page.")).toBeVisible();
});
for (const role of ["SPONSOR", "FACILITATOR"])
  test(`${role} cannot open calendar administration or write years`, async ({
    page,
  }) => {
    const f = await setup(page, role);
    await page.goto("/settings/academic-years");
    await expect(page).toHaveURL(
      role === "SPONSOR" ? /\/dashboard$/ : /\/register-roundtable$/,
    );
    await expect(
      page.getByRole("button", { name: "Add academic year", exact: true }),
    ).toHaveCount(0);
    expect(f.calls.some((c) => ["POST", "PATCH"].includes(c.method))).toBe(
      false,
    );
  });
for (const theme of ["light", "dark"])
  test(`calendar form and review are accessible on mobile in ${theme} theme`, async ({
    page,
  }) => {
    await setup(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      (value) => localStorage.setItem("ilead-theme", value),
      theme,
    );
    await page.goto("/settings/academic-years");
    await expect(
      page.getByRole("article", {
        name: `Academic year ${savedYear.label}`,
        exact: true,
      }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page
      .getByRole("button", { name: "Add academic year", exact: true })
      .click();
    await fillCalendar(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`calendar-form-${theme}.png`),
      fullPage: true,
    });
    await form(page)
      .getByRole("button", { name: "Review changes", exact: true })
      .click();
    await expect(dialog(page)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`calendar-review-${theme}.png`),
    });
  });
