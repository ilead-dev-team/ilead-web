import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiClient, ApiError } from "../src/lib/api.js";
const json = (body: unknown, status = 200) => Response.json(body, { status });
test("file transfers have a bounded longer deadline while ordinary requests keep one minute", async (t) => {
  const deadlines: number[] = [];
  t.mock.method(AbortSignal, "timeout", (ms: number) => {
    deadlines.push(ms);
    return new AbortController().signal;
  });
  const api = createApiClient(async (url) =>
    url === "/api/v1/dashboard" ? json({ data: "ok" }) : new Response("ok"),
  );
  assert.equal(
    (await api<Blob>("/reports/file", { responseType: "blob" })).size,
    2,
  );
  assert.deepEqual(await api("/dashboard"), { data: "ok" });
  assert.deepEqual(deadlines, [120000, 60000]);
});

test("a body transfer failure after successful headers is actionable and never replayed", async () => {
  let calls = 0,
    headers = 0;
  const api = createApiClient(async () => {
    calls++;
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error("connection lost after headers"));
        },
      }),
    );
  });
  await assert.rejects(
    api("/reports/file", {
      responseType: "blob",
      onResponse: () => {
        headers++;
      },
    }),
    {
      status: 0,
      code: "NETWORK_ERROR",
      message: "The file transfer was interrupted. Try downloading again.",
    },
  );
  assert.equal(headers, 1);
  assert.equal(calls, 1);
});

test("caller cancellation still interrupts a file body after headers without retry", async () => {
  const controller = new AbortController();
  let calls = 0;
  const api = createApiClient(async (_url, options) => {
    calls++;
    return new Response(
      new ReadableStream({
        start(stream) {
          options!.signal!.addEventListener(
            "abort",
            () => stream.error(new Error("cancelled")),
            { once: true },
          );
        },
      }),
    );
  });
  const transfer = api("/reports/file", {
    responseType: "blob",
    signal: controller.signal,
    onResponse: () => controller.abort(),
  });
  await assert.rejects(transfer, { code: "NETWORK_ERROR" });
  assert.equal(calls, 1);
});
test("protected requests share one refresh and retry with HttpOnly cookies", async () => {
  let active = false,
    rotations = 0;
  const transport: typeof fetch = async (url, options) => {
    assert.equal(options?.credentials, "include");
    assert.equal(options?.cache, "no-store");
    if (url === "/api/v1/auth/refresh") {
      rotations++;
      active = true;
      return json({ data: {} });
    }
    return active
      ? json({ data: "ok" })
      : json({ error: { code: "TOKEN_EXPIRED" } }, 401);
  };
  const api = createApiClient(transport);
  assert.deepEqual(
    await Promise.all([api("/auth/me"), api("/dashboard/summary")]),
    [{ data: "ok" }, { data: "ok" }],
  );
  assert.equal(rotations, 1);
});
test("public credential failures never attempt refresh", async () => {
  const paths: unknown[] = [];
  const api = createApiClient(async (url) => {
    paths.push(url);
    return json(
      {
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      },
      401,
    );
  });
  await assert.rejects(
    api("/auth/login", {
      method: "POST",
      public: true,
      body: { password: "secret" },
    }),
    { status: 401, code: "INVALID_CREDENTIALS" },
  );
  assert.deepEqual(paths, ["/api/v1/auth/login"]);
});
test("failed refresh does not retry a protected mutation", async () => {
  let writes = 0;
  const api = createApiClient(async (url) => {
    if (url === "/api/v1/roundtables") writes++;
    return json({}, 401);
  });
  await assert.rejects(api("/roundtables", { method: "POST", body: {} }), {
    code: "SESSION_EXPIRED",
  });
  assert.equal(writes, 1);
});
test("network failure never retries an uncertain mutation", async () => {
  let calls = 0;
  const api = createApiClient(async () => {
    calls++;
    throw new Error("network");
  });
  await assert.rejects(api("/roundtables", { method: "POST", body: {} }), {
    code: "NETWORK_ERROR",
  });
  assert.equal(calls, 1);
});
test("204 responses expose safe delivery headers without parsing a body", async () => {
  let revocation = "";
  const api = createApiClient(
    async () =>
      new Response(null, {
        status: 204,
        headers: { "X-Mailbox-Revocation": "unconfirmed" },
      }),
  );
  assert.equal(
    await api("/mailbox", {
      method: "DELETE",
      onResponse: (r) => {
        revocation = r.headers.get("X-Mailbox-Revocation")!;
      },
    }),
    undefined,
  );
  assert.equal(revocation, "unconfirmed");
});
test("API client preserves error codes/request IDs and rejects external destinations", async () => {
  const api = createApiClient(async () =>
    json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Unavailable",
          requestId: "trace",
        },
      },
      403,
    ),
  );
  await assert.rejects(
    api("/users"),
    (error: unknown) =>
      error instanceof ApiError &&
      error.requestId === "trace" &&
      error.status === 403,
  );
  await assert.rejects(api("//evil.test"), /relative/);
});
