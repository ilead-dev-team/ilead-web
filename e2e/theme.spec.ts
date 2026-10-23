import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("first visits follow system theme while a chosen theme survives system changes and reload", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("theme choices synchronize across tabs including native control color scheme", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  const second = await context.newPage();
  await second.goto("/login");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(second.locator("html")).toHaveClass(/dark/);
  await expect(second.locator("html")).toHaveCSS("color-scheme", "dark");
  await second.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
});

test("missing pages offer a themed accessible recovery destination at narrow widths", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/this-page-does-not-exist");
  await expect(
    page.getByRole("heading", { name: "Page not found." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to log in" }),
  ).toHaveAttribute("href", "/login");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("missing-page-dark.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
