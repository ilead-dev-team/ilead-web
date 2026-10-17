import { test, expect } from "@playwright/test";
test("real backend login forwards HttpOnly cookies through Next and logout invalidates the family", async ({
  page,
  context,
}) => {
  await page.route("**/api/v1/dashboard/summary", (r) =>
    r.fulfill({
      status: 404,
      json: {
        error: {
          code: "ACADEMIC_YEAR_NOT_FOUND",
          message: "Set up an academic year.",
        },
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Email address").fill("coordinator@example.test");
  await page.getByLabel("Password", { exact: true }).fill("BrowserPassword123");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL("/dashboard");
  const cookies = await context.cookies();
  const access = cookies.find((c) => c.name === "ilead_at")!,
    refresh = cookies.find((c) => c.name === "ilead_rt")!;
  expect(access.httpOnly).toBe(true);
  expect(access.sameSite).toBe("Lax");
  expect(refresh.path).toBe("/api/v1/auth");
  expect(await page.evaluate(() => document.cookie)).not.toContain("ilead_at");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/login");
  const response = await context.request.get("/api/v1/auth/me", {
    headers: { Cookie: `ilead_at=${access.value}` },
  });
  expect(response.status()).toBe(401);
});
test("real invitation acceptance creates the locked role account and login session", async ({
  page,
  context,
  request,
}) => {
  const { token } = await (
    await request.get("http://127.0.0.1:4011/__fixture")
  ).json();
  await page.route("**/api/v1/dashboard/summary", (r) =>
    r.fulfill({
      status: 404,
      json: { error: { code: "ACADEMIC_YEAR_NOT_FOUND" } },
    }),
  );
  await page.goto(`/invite/${token}`);
  await page.getByLabel("Full name").fill("Browser Sponsor");
  await page.getByLabel("Password", { exact: true }).fill("SponsorPassword123");
  await page.getByLabel("Confirm password").fill("SponsorPassword123");
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page).toHaveURL("/dashboard");
  const me = await context.request.get("/api/v1/auth/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).data.role).toBe("SPONSOR");
  const used = await request.get(`/api/v1/invitations/by-token/${token}`);
  expect(used.status()).toBe(404);
});
test("real reset consumes the emailed token and prevents reuse", async ({
  page,
  request,
}) => {
  const { resetToken } = await (
    await request.get("http://127.0.0.1:4011/__fixture")
  ).json();
  await page.goto(`/reset-password?token=${resetToken}`);
  await page
    .getByLabel("New password", { exact: true })
    .fill("ChangedPassword123");
  await page.getByLabel("Confirm new password").fill("ChangedPassword123");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Password reset." }),
  ).toBeVisible();
  const reused = await request.post("/api/v1/auth/reset-password", {
    headers: { Origin: "http://localhost:3011" },
    data: { token: resetToken, password: "AnotherPassword123" },
  });
  expect(reused.status()).toBe(401);
});
