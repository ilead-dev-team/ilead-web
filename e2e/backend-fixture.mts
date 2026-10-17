// Test-only HTTP harness. Never imported by application source or production start.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import type { TestContext } from "node:test";
if (process.env.ILEAD_BROWSER_FIXTURE !== "true")
  throw new Error("Explicit browser fixture opt-in required");
process.env.NODE_ENV = "test";
const { fixture, ownerId, targetId } =
  await import("../../ilead-backend/tests/mailbox/fixture.js");
const { createApp } = await import("../../ilead-backend/src/app.js");
const { sendRecovery } =
  await import("../../ilead-backend/src/modules/account-recovery/service.js");
const { configureRecoveryMail } =
  await import("../../ilead-backend/src/modules/account-recovery/index.js");
const { attemptAccountMail } =
  await import("../../ilead-backend/src/modules/mailbox/delivery.js");
const { default: argon2 } =
  await import("../../ilead-backend/node_modules/argon2/argon2.cjs");
process.env.WEB_ORIGIN = "http://localhost:3011";
process.env.MAIL_OAUTH_CALLBACK_URL = "http://localhost:3011/mailbox/callback";
const cleanups: (() => unknown)[] = [];
const f = fixture(
  { after: (fn: () => unknown) => cleanups.push(fn) } as unknown as TestContext,
  true,
);
const passwordHash = await argon2.hash("BrowserPassword123");
Object.assign(f.data.user![0]!, {
  name: "Browser Coordinator",
  email: "coordinator@example.test",
  passwordHash,
  classYear: "YEAR_2",
  emailVerifiedAt: new Date(),
});
Object.assign(f.data.user![1]!, {
  name: "Browser Facilitator",
  classYear: "YEAR_1",
  passwordHash,
  emailVerifiedAt: new Date(),
  roundtable: null,
});
const token = "b".repeat(43);
f.data.invitation!.push({
  id: "44444444-4444-4444-8444-444444444444",
  email: "browser-invite@example.test",
  role: "SPONSOR",
  invitedById: ownerId,
  tokenHash: createHash("sha256").update(token).digest("hex"),
  expiresAt: new Date(Date.now() + 86400000),
  acceptedAt: null,
  revokedAt: null,
});
f.data.accountRecoveryRequest!.push({
  id: "55555555-5555-4555-8555-555555555555",
  userId: targetId,
  status: "PENDING",
  requestedAt: new Date(),
});
configureRecoveryMail({ attempt: (id) => attemptAccountMail(id, f.deps) });
await sendRecovery(
  "55555555-5555-4555-8555-555555555555",
  ownerId,
  "browser-reset",
  f.deps.clock,
);
const mime = Buffer.from(f.rawMessages[0]!, "base64url").toString();
const text = Buffer.from(mime.split("\r\n\r\n")[1]!, "base64").toString();
const resetToken = text.match(/token=([A-Za-z0-9_-]{43})/)![1]!;
const app = createApp();
const server = createServer((req, res) => {
  if (req.url === "/__fixture") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ token, resetToken }));
    return;
  }
  app(req, res);
});
server.listen(4011, "127.0.0.1", () =>
  process.stdout.write("Test auth backend listening on 4011\n"),
);
process.on("SIGTERM", () => {
  server.close();
  for (const cleanup of cleanups.reverse()) cleanup();
});
