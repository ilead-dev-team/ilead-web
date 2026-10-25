import { test } from "node:test";
import assert from "node:assert/strict";
import {
  downloadReportWord,
  directDownloadUrl,
} from "../src/lib/report-download.js";
import { type api, ApiError } from "../src/lib/api.js";
const id = "11111111-1111-4111-8111-111111111111";
const type =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const grant = {
  data: {
    token: "encrypted-report-only-ticket",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  },
};
test("direct download keeps tickets in headers, omits cookies, and preserves version identity", async () => {
  const calls: string[] = [];
  let issued = 0;
  const client = (async (path: string, options: { body: unknown }) => {
    issued++;
    assert.equal(path, `/reports/${id}/export-ticket`);
    assert.deepEqual(options.body, { version: 4 });
    return grant;
  }) as typeof api;
  const transport: typeof fetch = async (url, init) => {
    calls.push(String(url));
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.redirect, "error");
    if (String(url) === "/api/download-config")
      return Response.json({ origin: "https://api.example" });
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer " + grant.data.token,
    );
    assert.equal(new Headers(init?.headers).has("cookie"), false);
    return new Response(new Uint8Array([80, 75, 3, 4]), {
      headers: { "Content-Type": type },
    });
  };
  assert.equal(
    (
      await downloadReportWord(
        id,
        4,
        new AbortController().signal,
        client,
        transport,
      )
    ).size,
    4,
  );
  assert.equal(issued, 1);
  assert.deepEqual(calls, [
    "/api/download-config",
    "https://api.example/api/v1/report-download",
  ]);
  assert.equal(
    calls.some((v) => v.includes(grant.data.token)),
    false,
  );
});
test("download destination rejects credentials, paths, queries, and remote HTTP", () => {
  for (const origin of [
    "http://remote.example",
    "https://user:secret@api.example",
    "https://api.example/other",
    "https://api.example/?token=secret",
    "https://api.example/#x",
  ])
    assert.throws(() => directDownloadUrl({ origin }));
  assert.equal(
    directDownloadUrl({ origin: "http://127.0.0.1:4000" }),
    "http://127.0.0.1:4000/api/v1/report-download",
  );
});
test("interrupted body and expired authorization require explicit retry without replay", async () => {
  for (const mode of ["interrupted", "expired"]) {
    let grants = 0,
      downloads = 0;
    const client = (async () => {
      grants++;
      return grant;
    }) as typeof api;
    const transport: typeof fetch = async (url) => {
      if (String(url) === "/api/download-config")
        return Response.json({ origin: "https://api.example" });
      downloads++;
      if (mode === "expired") return new Response(null, { status: 401 });
      return new Response(
        new ReadableStream({
          start(c) {
            c.error(Error("network lost"));
          },
        }),
        { headers: { "Content-Type": type } },
      );
    };
    await assert.rejects(
      () =>
        downloadReportWord(
          id,
          null,
          new AbortController().signal,
          client,
          transport,
        ),
      (e: unknown) =>
        e instanceof ApiError && /Try downloading again/.test(e.message),
    );
    assert.equal(grants, 1);
    assert.equal(downloads, 1);
  }
});
