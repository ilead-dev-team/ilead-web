import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

// Explicit targets prevent synthetic credentials from being sent to arbitrary hosts.
const origin = "https://ilead-web.vercel.app";
const api = "https://ilead-api-staging.onrender.com/api/v1";
const [accountsFile, journeyFile, outputDirectory, idleArgument = "960"] =
  process.argv.slice(2);
const idleSeconds = Number(idleArgument);
if (
  !accountsFile ||
  !journeyFile ||
  !outputDirectory ||
  !Number.isInteger(idleSeconds) ||
  idleSeconds < 0 ||
  idleSeconds > 3600
)
  throw Error(
    "Usage: node scripts/check-idle-downloads.mjs accounts.json journey.json ignored-output-directory [idle-seconds:0..3600]",
  );
const output = path.resolve(outputDirectory);
if (!output.startsWith(path.resolve("artifacts") + path.sep))
  throw Error(
    "Output must be inside this repository's ignored artifacts directory",
  );
const { actors } = JSON.parse(await fs.readFile(accountsFile, "utf8"));
const { report } = JSON.parse(await fs.readFile(journeyFile, "utf8"));
const actor = actors.COORDINATOR;
if (
  !actor.email.endsWith("@journeys.example.test") ||
  !actor.password ||
  !/^[0-9a-f-]{36}$/i.test(report)
)
  throw Error("Existing synthetic journey required");
await fs.mkdir(output, { recursive: true });
const evidence = {
  startedAt: new Date().toISOString(),
  origin,
  api,
  idleSeconds,
  scope:
    "Synthetic staging account; no report mutations. Harness sends no HTTP requests during idle window. Other traffic and provider cold state are not controlled.",
  results: [],
};
const checkpoint = () =>
  fs.writeFile(
    path.join(output, "results.json"),
    JSON.stringify(evidence, null, 2),
  );
await checkpoint();
console.log(JSON.stringify({ phase: "idle", seconds: idleSeconds }));
for (let remaining = idleSeconds; remaining > 0; remaining -= 30)
  await new Promise((resolve) =>
    setTimeout(resolve, Math.min(remaining, 30) * 1000),
  );
evidence.firstRequestAt = new Date().toISOString();
let cookie = "";
async function measured(name, url, options, timeoutMs) {
  const start = performance.now();
  const row = { name, timeoutMs };
  evidence.results.push(row);
  try {
    const response = await fetch(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    row.headersMs = Math.round(performance.now() - start);
    row.status = response.status;
    const bytes = Buffer.from(await response.arrayBuffer());
    row.totalMs = Math.round(performance.now() - start);
    row.bytes = bytes.length;
    return { response, bytes, row };
  } catch (error) {
    row.totalMs = Math.round(performance.now() - start);
    row.error = error.name; // Never persist response bodies, cookies or tickets.
    throw Error(`${name} failed (${error.name})`);
  } finally {
    await checkpoint();
    console.log(JSON.stringify(row));
  }
}
function parseResponse(bytes) {
  try {
    return JSON.parse(bytes.toString());
  } catch {
    // JSON parser messages can include response fragments containing credentials.
    throw Error("Service returned an invalid JSON response");
  }
}
async function download(name, version) {
  const start = performance.now();
  const { response: grantResponse, bytes: grantBytes } = await measured(
    `${name}-ticket`,
    `${origin}/api/v1/reports/${report}/export-ticket`,
    {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(version ? { version } : {}),
    },
    60000,
  );
  if (!grantResponse.ok)
    throw Error(`${name} ticket rejected: ${grantResponse.status}`);
  const token = parseResponse(grantBytes).data?.token;
  if (typeof token !== "string" || !token || token.length > 8192)
    throw Error("Service returned an invalid download grant");
  const remainingMs = 120000 - Math.round(performance.now() - start);
  if (remainingMs <= 0)
    throw Error("Download budget exhausted by ticket request");
  const { response, bytes, row } = await measured(
    name,
    `${api}/report-download`,
    {
      headers: { Origin: origin, Authorization: `Bearer ${token}` },
      credentials: "omit",
    },
    remainingMs,
  );
  row.actionMs = Math.round(performance.now() - start);
  row.mime = response.headers.get("content-type");
  row.cors = response.headers.get("access-control-allow-origin");
  row.filename = response.headers.get("content-disposition");
  row.zipSignature = bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]));
  row.sha256 = createHash("sha256").update(bytes).digest("hex");
  row.passed =
    response.ok &&
    row.zipSignature &&
    row.cors === origin &&
    row.mime?.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ) &&
    row.actionMs < 120000 &&
    (!version || row.filename?.includes(`_v${version}.docx`));
  await checkpoint();
  if (!row.passed) throw Error(`${name} failed download checks`);
  await fs.writeFile(path.join(output, `${name}.docx`), bytes);
}
try {
  const { response, bytes } = await measured(
    "first-login-after-idle",
    `${origin}/api/v1/auth/login`,
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ email: actor.email, password: actor.password }),
    },
    60000,
  );
  if (!response.ok) throw Error(`Login rejected: ${response.status}`);
  cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  if (!cookie) throw Error("Login did not return session cookies");
  if (parseResponse(bytes).data?.user?.role !== "COORDINATOR")
    throw Error("Unexpected account role");
  await download("first-current");
  await download("warm-current");
  await download("historical-v4", 4);
  evidence.outcome =
    "passed-idle-start-sample; provider-cold-state-unconfirmed";
} catch (error) {
  evidence.outcome = "failed";
  evidence.failure = error.message;
  process.exitCode = 1;
} finally {
  if (cookie) {
    try {
      const { response } = await measured(
        "logout",
        `${origin}/api/v1/auth/logout`,
        {
          method: "POST",
          headers: { Origin: origin, Cookie: cookie },
        },
        60000,
      );
      evidence.logoutPassed = response.ok;
    } catch {
      evidence.logoutPassed = false;
    }
    if (!evidence.logoutPassed) process.exitCode = 1;
  }
  evidence.completedAt = new Date().toISOString();
  await checkpoint();
  console.log(
    JSON.stringify({
      outcome: evidence.outcome,
      logoutPassed: evidence.logoutPassed,
    }),
  );
}
