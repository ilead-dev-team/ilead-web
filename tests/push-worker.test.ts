import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const source = await readFile(
  new URL("../public/push-worker.js", import.meta.url),
  "utf8",
);
function worker() {
  const handlers: Record<string, (event: unknown) => void> = {},
    shown: { title: string; options: Record<string, unknown> }[] = [],
    opened: string[] = [];
  const self = {
    location: { origin: "https://ilead.example" },
    addEventListener: (name: string, fn: (event: unknown) => void) => {
      handlers[name] = fn;
    },
    skipWaiting: async () => {},
    clients: {
      claim: async () => {},
      openWindow: async (url: string) => {
        opened.push(url);
      },
    },
    registration: {
      showNotification: async (
        title: string,
        options: Record<string, unknown>,
      ) => {
        shown.push({ title, options });
      },
    },
  };
  vm.runInNewContext(source, { self, URL });
  return {
    handlers,
    shown,
    opened,
    dispatch: async (name: string, values: object) => {
      const pending: Promise<unknown>[] = [];
      handlers[name]!({
        ...values,
        waitUntil: (p: Promise<unknown>) => pending.push(p),
      });
      await Promise.all(pending);
    },
  };
}
test("push worker uses fixed private content, bounded tags and exact local destinations", async () => {
  for (const link of [
    "https://evil.test",
    "//evil.test",
    "/reports/%2fprivate",
    "/dashboard?redirect=evil",
    "/people/recovery?request=secret",
  ]) {
    const w = worker();
    await w.dispatch("push", {
      data: {
        json: () => ({
          title: "Reset secret",
          body: "Private comment",
          link,
          tag: "unbounded-secret",
        }),
      },
    });
    assert.equal(w.shown[0]!.title, "iLead update");
    assert.equal(w.shown[0]!.options.body, "Open iLead to view your update.");
    assert.deepEqual(JSON.parse(JSON.stringify(w.shown[0]!.options.data)), {
      link: "/notifications",
    });
    assert.equal(w.shown[0]!.options.tag, undefined);
  }
});
test("push click enters the allowed application route without marking read or caching content", async () => {
  const w = worker(),
    link = "/reports/11111111-1111-4111-8111-111111111111#comments";
  let closed = false;
  await w.dispatch("notificationclick", {
    notification: {
      close: () => {
        closed = true;
      },
      data: { link },
    },
  });
  assert.equal(closed, true);
  assert.deepEqual(w.opened, [`https://ilead.example${link}`]);
  assert.equal(w.handlers.fetch, undefined);
});
test("malformed push data is generic and changed subscriptions never silently rebind", async () => {
  const w = worker();
  await w.dispatch("push", {
    data: {
      json: () => {
        throw new Error("bad");
      },
    },
  });
  assert.equal(w.shown.length, 1);
  let removed = false;
  await w.dispatch("pushsubscriptionchange", {
    newSubscription: {
      unsubscribe: async () => {
        removed = true;
      },
    },
  });
  assert.equal(removed, true);
});
