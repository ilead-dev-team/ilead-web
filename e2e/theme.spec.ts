import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("the new brand appears in both themes and exposes browser and app icons", async ({
  page,
  request,
}, testInfo) => {
  await page.goto("/login");
  const light = page.locator('img.logo-light[alt="iLead platform"]');
  const dark = page.locator('img.logo-dark[alt="iLead platform"]');
  await expect(light).toBeVisible();
  await expect(light).toHaveAttribute("src", /ilead-wordmark-ink\.svg/);
  await expect(dark).toBeHidden();
  await page.screenshot({
    path: testInfo.outputPath("brand-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(dark).toBeVisible();
  await expect(light).toBeHidden();
  await page.screenshot({
    path: testInfo.outputPath("brand-dark.png"),
    fullPage: true,
  });
  const favicon = await request.get("/favicon.ico");
  expect(favicon.ok()).toBe(true);
  const faviconBytes = await favicon.body();
  expect(faviconBytes.length).toBeGreaterThan(500);
  expect(faviconBytes.readUInt16LE(4)).toBe(3);
  expect([6, 22, 38].map((offset) => faviconBytes.readUInt8(offset))).toEqual([
    16, 32, 48,
  ]);
  const icon = await request.get("/icon.svg");
  expect(icon.ok()).toBe(true);
  expect(await icon.text()).toContain("<svg");
  expect(await icon.text()).toContain('fill="#007595"');
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: "/brand/push-192.png" }),
      expect.objectContaining({ src: "/brand/push-512.png" }),
    ]),
  );
});

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
