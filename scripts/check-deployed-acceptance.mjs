import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Existing synthetic staging accounts only. Credentials and cookies never enter evidence.
const origin = "https://ilead-web.vercel.app";
const [accountsFile, previousEvidenceFile, outputDirectory] =
  process.argv.slice(2);
assert.ok(
  accountsFile && previousEvidenceFile && outputDirectory,
  "Usage: node scripts/check-deployed-acceptance.mjs <ignored-accounts.json> <prior-evidence.json> <ignored-output-directory>",
);
const { actors } = JSON.parse(await readFile(accountsFile, "utf8"));
const previous = JSON.parse(await readFile(previousEvidenceFile, "utf8"));
assert.match(previous.report, /^[a-f0-9-]{36}$/);
const reportId = previous.report;
const checks = [];
const privateCommentIds = new Set();
await mkdir(outputDirectory, { recursive: true });

for (const role of ["COORDINATOR", "SPONSOR", "FACILITATOR"]) {
  assert.ok(
    actors[role]?.email && actors[role]?.password,
    `Missing ${role} test account`,
  );
  assert.ok(
    actors[role].email.endsWith("@journeys.example.test"),
    "Only synthetic journey accounts may be used",
  );
  let cookie = "";
  async function request(route, expected = 200, body) {
    const started = performance.now();
    const response = await fetch(`${origin}/api/v1${route}`, {
      method: body ? "POST" : "GET",
      headers: {
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(90000),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    let json;
    try {
      json = JSON.parse(bytes.toString("utf8"));
    } catch {
      /* binary export */
    }
    assert.equal(
      response.status,
      expected,
      `${role} ${route}: ${response.status} ${json?.error?.code ?? ""}`,
    );
    checks.push({
      role,
      method: body ? "POST" : "GET",
      route,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
    });
    await writeFile(
      path.join(outputDirectory, "partial-evidence.json"),
      JSON.stringify({ origin, checks }, null, 2),
    );
    return { response, bytes, data: json?.data };
  }
  const login = await request("/auth/login", 200, {
    email: actors[role].email,
    password: actors[role].password,
  });
  cookie = login.response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  assert.ok(cookie, `${role} login did not return cookies`);
  const user = (await request("/auth/me")).data;
  assert.equal(user.role, role);
  await request("/notifications?page=1&pageSize=20&unread=false");
  await request("/reminders?page=1&pageSize=20");
  if (role === "FACILITATOR") {
    assert.ok(
      user.roundtableId,
      "Synthetic Facilitator must already have a roundtable",
    );
    const own = (await request(`/roundtables/${user.roundtableId}`)).data;
    assert.equal(own.id, user.roundtableId);
    await request(`/roundtables/${user.roundtableId}/progress`);
    for (const route of [
      "/sessions?page=1&pageSize=20",
      `/reports/${reportId}`,
      `/reports/${reportId}/export/docx`,
      "/exports/roundtables.xlsx",
    ])
      await request(route, 403);
    continue;
  }
  await request("/dashboard/summary");
  const reports = (await request("/reports?page=1&pageSize=20")).data;
  assert.ok(Array.isArray(reports));
  if (role === "SPONSOR")
    assert.ok(
      reports.every((report) =>
        ["SENT", "CHANGES_REQUESTED"].includes(report.status),
      ),
      "Sponsor received unpublished report",
    );
  const report = (await request(`/reports/${reportId}`)).data;
  assert.ok(report.version >= 2);
  const comments = (
    await request(`/reports/${reportId}/comments?page=1&pageSize=20`)
  ).data;
  assert.ok(Array.isArray(comments));
  if (role === "COORDINATOR") {
    for (const comment of comments)
      if (!comment.visibleToSponsor) privateCommentIds.add(comment.id);
    assert.ok(
      privateCommentIds.size > 0,
      "Acceptance report needs an existing private discussion",
    );
  }
  if (role === "SPONSOR")
    assert.ok(
      comments.length > 0 &&
        comments.every(
          (comment) =>
            comment.visibleToSponsor === true &&
            !privateCommentIds.has(comment.id),
        ),
      "Sponsor received private comment",
    );
  await request(`/reports/${reportId}/versions?page=1&pageSize=20`);
  const version = (await request(`/reports/${reportId}/versions/1`)).data;
  assert.equal(version.version, 1);
  for (const [route, name, mime] of [
    [
      `/reports/${reportId}/export/docx`,
      `${role.toLowerCase()}-report-current.docx`,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    [
      `/reports/${reportId}/versions/1/export/docx`,
      `${role.toLowerCase()}-report-v1.docx`,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    [
      "/exports/roundtables.xlsx",
      `${role.toLowerCase()}-roundtables.xlsx`,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  ]) {
    const file = await request(route);
    assert.ok(
      file.response.headers.get("content-type")?.includes(mime),
      "Unexpected export MIME type",
    );
    assert.equal(file.bytes.subarray(0, 2).toString(), "PK");
    assert.ok(file.bytes.length > 1000);
    await writeFile(path.join(outputDirectory, name), file.bytes);
  }
  if (role === "SPONSOR") {
    await request("/sessions?page=1&pageSize=20");
    // Reuse an existing date: even a broken permission guard cannot create a duplicate session.
    await request("/sessions", 403, {
      date: report.session.date,
      activities: [],
    });
    for (const route of [
      "/users?role=COORDINATOR&page=1&pageSize=20",
      "/invitations?page=1&pageSize=20",
    ])
      await request(route, 403);
  }
}
await writeFile(
  path.join(outputDirectory, "evidence.json"),
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      origin,
      checks,
      limitation:
        "API acceptance through the deployed frontend proxy; not a substitute for browser or physical-device acceptance.",
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ passed: checks.length, roles: 3, exports: 6 }));
