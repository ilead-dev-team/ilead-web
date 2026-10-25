import { test } from "node:test";
import assert from "node:assert/strict";
import { forwardWordDownload } from "../src/lib/download-proxy.js";
const id = "11111111-1111-4111-8111-111111111111";
const type =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const request = (
  cookie = "ilead_at=test-access; ilead_rt=private-refresh; other=unrelated",
  search = "",
) =>
  new Request(
    "https://web.example/api/v1/reports/" + id + "/export/docx" + search,
    { headers: { cookie } },
  );
test("download proxy streams before the complete body and forwards only access authentication", async () => {
  let finish!: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array([80, 75, 3, 4]));
      finish = () => {
        c.enqueue(new Uint8Array([5]));
        c.close();
      };
    },
  });
  let received = "";
  const result = await forwardWordDownload(
    request(),
    { id },
    "https://api.example",
    async (url, init) => {
      received = String(url);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("cookie"), "ilead_at=test-access");
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.redirect, "error");
      assert.equal(headers.get("accept-encoding"), "identity");
      return new Response(body, {
        headers: {
          "Content-Type": type,
          "Content-Disposition": 'attachment; filename="report.docx"',
          "Content-Length": "5",
          "Set-Cookie": "must-not-leak=1",
          "Access-Control-Allow-Origin": "*",
        },
      });
    },
  );
  assert.equal(
    received,
    `https://api.example/api/v1/reports/${id}/export/docx`,
  );
  assert.equal(result.headers.get("set-cookie"), null);
  assert.equal(result.headers.get("access-control-allow-origin"), null);
  assert.match(result.headers.get("cache-control")!, /private, no-store/);
  const reader = result.body!.getReader();
  assert.deepEqual((await reader.read()).value, new Uint8Array([80, 75, 3, 4]));
  finish();
  assert.deepEqual((await reader.read()).value, new Uint8Array([5]));
});
test("download proxy preserves version identity, backend denials and retry guidance without caching", async () => {
  for (const status of [401, 403, 404, 429]) {
    const r = await forwardWordDownload(
      request(),
      { id, version: "4" },
      "https://api.example",
      async (url) => {
        assert.equal(
          String(url),
          `https://api.example/api/v1/reports/${id}/versions/4/export/docx`,
        );
        return Response.json(
          { error: { code: "DENIED", message: "Not allowed" } },
          { status, headers: { "Retry-After": "30" } },
        );
      },
    );
    assert.equal(r.status, status);
    assert.equal(r.headers.get("retry-after"), "30");
    assert.equal((await r.json()).error.code, "DENIED");
  }
});
test("download proxy rejects malformed destinations and missing or ambiguous sessions before forwarding", async () => {
  let calls = 0;
  const transport: typeof fetch = async () => {
    calls++;
    throw Error("must not run");
  };
  for (const params of [
    { id: "../auth" },
    { id, version: "0" },
    { id, version: "2147483648" },
    { id, version: "4/path" },
  ])
    assert.equal(
      (
        await forwardWordDownload(
          request(),
          params,
          "https://api.example",
          transport,
        )
      ).status,
      400,
    );
  for (const cookie of ["", "ilead_at=", "ilead_at=a; ilead_at=b"])
    assert.equal(
      (
        await forwardWordDownload(
          request(cookie),
          { id },
          "https://api.example",
          transport,
        )
      ).status,
      401,
    );
  assert.equal(
    (
      await forwardWordDownload(
        request(undefined, "?url=https://other.example"),
        { id },
        "https://api.example",
        transport,
      )
    ).status,
    400,
  );
  await assert.rejects(() =>
    forwardWordDownload(
      request(),
      { id },
      "https://api.example/other",
      transport,
    ),
  );
  assert.equal(calls, 0);
});
test("download proxy propagates caller cancellation and rejects invalid successful payloads", async () => {
  const controller = new AbortController();
  controller.abort();
  const r = await forwardWordDownload(
    new Request(request(), { signal: controller.signal }),
    { id },
    "https://api.example",
    async (_url, init) => {
      assert.equal(init?.signal?.aborted, true);
      throw new DOMException("aborted", "AbortError");
    },
  );
  assert.equal(r.status, 502);
  const bad = await forwardWordDownload(
    request(),
    { id },
    "https://api.example",
    async () => new Response("<html>error</html>"),
  );
  assert.equal(bad.status, 502);
  const decoded = await forwardWordDownload(
    request(),
    { id },
    "https://api.example",
    async () =>
      new Response("decoded", {
        headers: {
          "Content-Type": type,
          "Content-Encoding": "gzip",
          "Content-Length": "2",
        },
      }),
  );
  assert.equal(decoded.headers.get("content-length"), null);
  assert.equal(decoded.headers.get("content-encoding"), null);
});
