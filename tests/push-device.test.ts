import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { api } from "../src/lib/api.js";
import {
  deviceSchema,
  devicesSchema,
  publicKeyBytes,
  inspectPush,
  enablePush,
  disablePush,
  logoutWithPush,
  type PushPort,
} from "../src/lib/push-device.js";
const user = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const device = {
  id: "33333333-3333-4333-8333-333333333333",
  deviceLabel: "Laptop",
  createdAt: "2026-10-20T06:00:00.000Z",
};
const pair = createECDH("prime256v1");
pair.generateKeys();
const key = pair.getPublicKey().toString("base64url");
function fixture() {
  const values = new Map<string, string>(),
    events: string[] = [],
    bodies: unknown[] = [];
  let permission: NotificationPermission = "default",
    subscribed = false,
    registered = false,
    listed = true,
    failPost = false,
    failDelete = false,
    mismatched = false,
    actingUser = user;
  const sub = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test-only-device",
    options: { applicationServerKey: publicKeyBytes(key).buffer },
    toJSON: () => ({ keys: { p256dh: key, auth: "test-only" } }),
    unsubscribe: async () => {
      events.push("unsubscribe");
      subscribed = false;
      return true;
    },
  } as unknown as PushSubscription;
  const reg = {
    pushManager: {
      getSubscription: async () => (subscribed ? sub : null),
      subscribe: async () => {
        events.push("subscribe");
        subscribed = true;
        return sub;
      },
    },
    getNotifications: async () => [{ close: () => events.push("close") }],
  } as unknown as ServiceWorkerRegistration;
  const port: PushPort = {
    supported: true,
    permission: () => permission,
    requestPermission: async () => {
      events.push("permission");
      permission = "granted";
      return permission;
    },
    registration: async () => (registered ? reg : undefined),
    register: async () => {
      events.push("register");
      registered = true;
      return reg;
    },
    storage: {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => {
        values.set(k, v);
      },
      removeItem: (k) => {
        values.delete(k);
      },
    },
  };
  const transport = (async (
    path: string,
    options?: { method?: string; body?: unknown },
  ) => {
    events.push(`${options?.method ?? "GET"} ${path}`);
    if (path === "/auth/me") return { data: { id: actingUser } };
    if (path === "/push/public-key") return { data: { publicKey: key } };
    if (path === "/push/subscriptions" && options?.method === "POST") {
      bodies.push(options.body);
      if (failPost) throw new Error("Registration unavailable");
      return {
        data: mismatched ? { ...device, endpoint: sub.endpoint } : device,
      };
    }
    if (path === "/push/subscriptions") return { data: listed ? [device] : [] };
    if (options?.method === "DELETE") {
      if (failDelete) throw new Error("Removal unavailable");
      listed = false;
      return undefined;
    }
    if (path === "/auth/logout") {
      bodies.push(options?.body);
      return undefined;
    }
    throw new Error("Unexpected fixture request");
  }) as typeof api;
  return {
    port,
    transport,
    values,
    events,
    bodies,
    hasSubscription: () => subscribed,
    state: (v: {
      permission?: NotificationPermission;
      listed?: boolean;
      failPost?: boolean;
      failDelete?: boolean;
      mismatched?: boolean;
      user?: string;
    }) => {
      permission = v.permission ?? permission;
      listed = v.listed ?? listed;
      failPost = v.failPost ?? failPost;
      failDelete = v.failDelete ?? failDelete;
      mismatched = v.mismatched ?? mismatched;
      actingUser = v.user ?? actingUser;
    },
  };
}
test("permission and registration occur only on explicit enable, with no credential persistence", async () => {
  const f = fixture();
  assert.equal(await inspectPush(user, f.port, f.transport), "Not enabled");
  assert.deepEqual(f.events, []);
  await enablePush(user, " Laptop ", f.port, f.transport);
  assert.equal(f.events[0], "permission");
  assert.equal(await inspectPush(user, f.port, f.transport), "Enabled");
  assert.deepEqual(Object.keys(f.bodies[0] as object).sort(), [
    "deviceLabel",
    "endpoint",
    "keys",
  ]);
  const persisted = [...f.values.values()].join("");
  assert.ok(
    !persisted.includes("https://") &&
      !persisted.includes("p256dh") &&
      !persisted.includes("auth"),
  );
  assert.ok(persisted.includes(user) && persisted.includes(device.id));
});
test("denied and unsupported browsers never request permission or call registration", async () => {
  for (const unsupported of [false, true]) {
    const f = fixture();
    f.port.supported = !unsupported;
    f.state({ permission: "denied" });
    assert.equal(
      await inspectPush(user, f.port, f.transport),
      unsupported ? "Unsupported" : "Blocked",
    );
    await assert.rejects(enablePush(user, "", f.port, f.transport));
    assert.deepEqual(f.events, []);
  }
});
test("failed and malformed registration stop the local subscription without false enabled state", async () => {
  for (const malformed of [false, true]) {
    const f = fixture();
    f.state(malformed ? { mismatched: true } : { failPost: true });
    await assert.rejects(enablePush(user, "", f.port, f.transport));
    assert.equal(f.hasSubscription(), false);
    assert.equal(f.values.size, 0);
  }
});
test("account switch unsubscribes the previous endpoint and never deletes a foreign binding or auto-enables", async () => {
  const f = fixture();
  await enablePush(user, "", f.port, f.transport);
  f.events.length = 0;
  f.state({ user: other });
  assert.equal(await inspectPush(other, f.port, f.transport), "Not enabled");
  assert.deepEqual(f.events, ["GET /auth/me", "unsubscribe", "close"]);
  assert.equal(f.values.size, 0);
  assert.equal(f.hasSubscription(), false);
});
test("remote deletion and revoked permission reconcile locally without automatic subscription", async () => {
  for (const revoked of [false, true]) {
    const f = fixture();
    await enablePush(user, "", f.port, f.transport);
    f.events.length = 0;
    f.state(revoked ? { permission: "denied" } : { listed: false });
    assert.equal(
      await inspectPush(user, f.port, f.transport),
      revoked ? "Blocked" : "Not enabled",
    );
    assert.equal(f.hasSubscription(), false);
    assert.ok(
      !f.events.includes("subscribe") && !f.events.includes("permission"),
    );
  }
});
test("a stale account check cannot unsubscribe the current account's device", async () => {
  const f = fixture();
  await enablePush(user, "", f.port, f.transport);
  f.state({ user: other });
  await assert.rejects(
    inspectPush(user, f.port, f.transport),
    /account changed/,
  );
  assert.equal(f.hasSubscription(), true);
  await assert.rejects(
    disablePush(user, f.port, f.transport),
    /account changed/,
  );
  assert.equal(f.hasSubscription(), true);
});
test("disable stops the browser even when server deletion fails, retaining its ID for retry", async () => {
  const f = fixture();
  await enablePush(user, "", f.port, f.transport);
  f.state({ failDelete: true });
  await assert.rejects(
    disablePush(user, f.port, f.transport),
    /Removal unavailable/,
  );
  assert.equal(f.hasSubscription(), false);
  assert.equal(f.values.size, 1);
  f.state({ failDelete: false });
  await disablePush(user, f.port, f.transport);
  assert.equal(f.values.size, 0);
});
test("logout unsubscribes and clears delivered alerts before sending only the current binding ID", async () => {
  const f = fixture();
  await enablePush(user, "", f.port, f.transport);
  f.events.length = 0;
  await logoutWithPush(user, f.port, f.transport);
  assert.deepEqual(f.events, ["unsubscribe", "close", "POST /auth/logout"]);
  assert.deepEqual(f.bodies.at(-1), { pushSubscriptionId: device.id });
  assert.equal(f.values.size, 0);
});
test("corrupt browser state cannot prevent logout or inject another account binding", async () => {
  const f = fixture();
  f.values.set("ilead-push-binding-v1", "malformed");
  await logoutWithPush(user, f.port, f.transport);
  assert.deepEqual(f.bodies.at(-1), {});
});
test("a changed authenticated account refuses enable before creating a subscription", async () => {
  const f = fixture();
  f.state({ user: other });
  await assert.rejects(
    enablePush(user, "", f.port, f.transport),
    /account changed/,
  );
  assert.ok(!f.events.includes("subscribe"));
});
test("device/key schemas reject secret fields, duplicates and malformed keys", () => {
  assert.equal(publicKeyBytes(key).length, 65);
  for (const value of ["", "private-key", "A".repeat(87)])
    assert.throws(() => publicKeyBytes(value));
  assert.equal(
    deviceSchema.safeParse({ ...device, endpoint: "secret" }).success,
    false,
  );
  assert.equal(
    devicesSchema.safeParse({ data: [device, device] }).success,
    false,
  );
});
