import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { staff, recovery } from "../tests/fixtures/account-delivery";
import { currentYear, savedYear } from "../tests/fixtures/academic-management";
import { person } from "../tests/fixtures/people";
import { curriculumFixture } from "../tests/fixtures/curriculum";

const names = [
  "Reflection",
  "WeLead",
  "WeOut",
  "Icebreaker",
  "iLead song",
  "Closing discussion",
];
const sections = [
  "Opening summary",
  "Session highlights",
  "Challenges",
  "Recommendations",
  "Announcements",
  "Upcoming activities",
];
const requestNames = [
  "Ada Example",
  "Jean Coordinator",
  "Jane Coordinator",
  "Alex Facilitator",
  "Sam Facilitator",
  "Pat Sponsor",
];
const id = (n: number) =>
  `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
async function fixtures(page: Page) {
  const writes: string[] = [];
  await page.route("**/api/v1/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    if (request.method() !== "GET") writes.push(path);
    const list = (data: unknown[]) =>
      route.fulfill({
        json: {
          data,
          meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
        },
      });
    if (path === "/auth/me") return route.fulfill({ json: { data: staff } });
    if (path === "/notifications/unread-count")
      return route.fulfill({ json: { data: { count: 0 } } });
    if (path === "/push/subscriptions")
      return route.fulfill({ json: { data: [] } });
    if (path === "/academic-years/current")
      return route.fulfill({ json: { data: currentYear } });
    if (path === "/academic-years")
      return list([
        savedYear,
        { ...savedYear, id: id(92), label: "2027/2028" },
      ]);
    if (path === "/activity-types")
      return list(
        names.map((name, n) => ({
          id: id(n + 10),
          name,
          position: n,
          isActive: true,
        })),
      );
    if (path === "/section-templates")
      return list(
        sections.map((title, n) => ({
          id: id(n + 20),
          key: `section-${n}`,
          title,
          kind: n % 2 ? "BULLETS" : "TEXT",
          autoSource: "NONE",
          isMandatory: false,
          isPreselected: false,
          isSystem: false,
          isArchived: false,
          position: n,
        })),
      );
    if (path === "/account-recovery")
      return list(
        requestNames.map((name, n) => ({
          ...recovery,
          id: id(n + 30),
          user: { ...recovery.user, id: id(n + 40), name },
        })),
      );
    if (path === "/users")
      return list(
        requestNames.map((name, n) => ({ ...person, id: id(n + 50), name })),
      );
    if (path === "/curriculum")
      return route.fulfill({ json: curriculumFixture() });
    return route.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "No layout fixture" } },
    });
  });
  return writes;
}

for (const surface of [
  {
    name: "academic-years",
    url: "/settings/academic-years",
    title: "Academic years",
  },
  { name: "activities", url: "/settings/activities", title: "Activity types" },
  { name: "sections", url: "/settings/sections", title: "Section library" },
  { name: "recovery", url: "/people/recovery", title: "Account recovery" },
  { name: "people", url: "/people", title: "People" },
  { name: "curriculum", url: "/curriculum", title: "Curriculum" },
]) {
  test(`${surface.name} uses responsive space and concise details in both themes`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.addInitScript(() =>
      localStorage.setItem("ilead-theme", "light"),
    );
    const writes = await fixtures(page);
    await page.goto(surface.url);
    await expect(
      page.getByRole("heading", { name: surface.title, exact: true }),
    ).toBeVisible();
    // Wait for real fixture content, not just the shell heading.
    if (surface.name === "academic-years")
      await expect(page.getByRole("article").first()).toBeVisible();
    if (surface.name === "activities" || surface.name === "sections")
      await expect(
        page.getByRole("button", { name: /^Edit (activity|section) / }),
      ).toHaveCount(6);
    if (surface.name === "recovery") {
      await expect(
        page.getByRole("link", { name: /^View details for/ }),
      ).toHaveCount(6);
      await expect(
        page.getByText(recovery.user.email, { exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole("table")).toHaveCount(0);
    }
    if (surface.name === "people") {
      await expect(
        page.getByRole("heading", { name: "Ada Example", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(person.email, { exact: true }).first(),
      ).not.toBeVisible();
      await page
        .locator("details")
        .filter({ hasText: "View details for Ada Example" })
        .locator("summary")
        .click();
      await expect(
        page.getByText(person.email, { exact: true }).first(),
      ).toBeVisible();
      await page
        .locator("details")
        .filter({ hasText: "View details for Ada Example" })
        .locator("summary")
        .click();
      await expect(page.getByRole("table")).toHaveCount(0);
    }
    if (surface.name === "curriculum")
      await expect(
        page.getByRole("form", { name: /^Edit iChoose/ }),
      ).toHaveCount(16);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      for (const theme of ["light", "dark"]) {
        const active = await page
          .locator("html")
          .evaluate((el) => el.classList.contains("dark"));
        if (active !== (theme === "dark"))
          await page
            .getByRole("button", { name: /Switch to (light|dark) mode/ })
            .click();
        await expect
          .poll(() =>
            page
              .locator("html")
              .evaluate((el) => el.classList.contains("dark")),
          )
          .toBe(theme === "dark");
        expect(
          (await page
            .getByRole("heading", { name: surface.title, exact: true })
            .boundingBox())!.y,
        ).toBeLessThan(160);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (
          width === 1440 &&
          ["activities", "sections", "curriculum"].includes(surface.name)
        ) {
          const forms =
            surface.name === "curriculum"
              ? page.getByRole("form", { name: /^Edit / })
              : page.getByRole("button", { name: /^Edit (activity|section) / });
          const a = (await forms.nth(0).boundingBox())!;
          const b = (await forms.nth(1).boundingBox())!;
          expect(b.x).toBeGreaterThan(a.x + a.width - 1);
          expect(Math.abs(a.y - b.y)).toBeLessThan(2);
        }
        await page.screenshot({
          path: info.outputPath(`${surface.name}-${width}-${theme}.png`),
          fullPage: true,
        });
      }
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(writes).toEqual([]);
  });
}
