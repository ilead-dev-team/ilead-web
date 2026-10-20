import { z } from "zod";
import { api, ApiError } from "./api";
export const deviceSchema = z.strictObject({
  id: z.uuid(),
  deviceLabel: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Device = z.infer<typeof deviceSchema>;
export const devicesSchema = z
  .object({ data: z.array(deviceSchema).max(20) })
  .refine((v) => new Set(v.data.map((d) => d.id)).size === v.data.length);
const bindingSchema = z.strictObject({
  id: z.uuid(),
  userId: z.string().min(1),
  endpointHash: z.string().regex(/^[a-f0-9]{64}$/),
});
const storageKey = "ilead-push-binding-v1";
export type PushStatus = "Unsupported" | "Blocked" | "Not enabled" | "Enabled";
export interface PushPort {
  supported: boolean;
  permission(): NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  registration(): Promise<ServiceWorkerRegistration | undefined>;
  register(): Promise<ServiceWorkerRegistration>;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}
function ownedRegistration(reg: ServiceWorkerRegistration | undefined) {
  if (!reg) return undefined;
  const worker = reg.active ?? reg.waiting ?? reg.installing;
  if (
    !worker ||
    new URL(worker.scriptURL).pathname !== "/push-worker.js" ||
    new URL(reg.scope).pathname !== "/"
  )
    throw new Error(
      "An unexpected service worker controls push. Contact the deployment administrator.",
    );
  return reg;
}
export function browserPushPort(): PushPort {
  return {
    supported:
      window.isSecureContext &&
      "Notification" in window &&
      "PushManager" in window &&
      "serviceWorker" in navigator &&
      !!globalThis.crypto?.subtle,
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    registration: async () =>
      ownedRegistration(await navigator.serviceWorker.getRegistration("/")),
    register: async () => {
      const previous = await navigator.serviceWorker.getRegistration("/");
      ownedRegistration(previous);
      const reg = await navigator.serviceWorker.register("/push-worker.js", {
        scope: "/",
        updateViaCache: "none",
      });
      const worker = reg.installing ?? reg.waiting ?? reg.active;
      if (!worker)
        throw new Error("Push worker is unavailable. Refresh and try again.");
      if (worker.state !== "activated")
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () =>
              finish(
                new Error(
                  "Push worker did not activate. Refresh and try again.",
                ),
              ),
            15000,
          );
          function finish(error?: Error) {
            clearTimeout(timer);
            worker!.removeEventListener("statechange", changed);
            if (error) reject(error);
            else resolve();
          }
          function changed() {
            if (worker!.state === "activated") finish();
            else if (worker!.state === "redundant")
              finish(new Error("Push worker installation failed."));
          }
          worker.addEventListener("statechange", changed);
          changed();
        });
      return reg;
    },
    get storage() {
      return localStorage;
    },
  };
}
function binding(port: PushPort) {
  const value = port.storage.getItem(storageKey);
  if (!value) return null;
  const parsed = bindingSchema.safeParse(JSON.parse(value));
  if (!parsed.success)
    throw new Error(
      "Device state could not be verified. Clear this site's stored data and enable notifications again.",
    );
  return parsed.data;
}
async function fingerprint(endpoint: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(endpoint),
  );
  return Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export function publicKeyBytes(value: string) {
  if (!/^[A-Za-z0-9_-]{87}$/.test(value))
    throw new Error("The push public key is invalid.");
  const bytes = Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/") + "="),
    (c) => c.charCodeAt(0),
  );
  if (bytes.length !== 65 || bytes[0] !== 4)
    throw new Error("The push public key is invalid.");
  return bytes;
}
type Transport = typeof api;
async function currentUser(userId: string, transport: Transport) {
  const response = z
    .object({ data: z.object({ id: z.string() }) })
    .parse(await transport("/auth/me"));
  if (response.data.id !== userId)
    throw new ApiError(
      409,
      "ACCOUNT_CHANGED",
      "Your account changed. Refresh before enabling notifications.",
    );
}
async function localUnsubscribe(reg: ServiceWorkerRegistration | undefined) {
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (
    sub &&
    !(await sub.unsubscribe()) &&
    (await reg.pushManager.getSubscription())
  )
    throw new Error(
      "This browser could not disable its subscription. Check browser settings and retry.",
    );
  for (const notice of await reg.getNotifications()) notice.close();
}
async function remove(id: string, transport: Transport) {
  const response = await transport(`/push/subscriptions/${id}`, {
    method: "DELETE",
  });
  if (response !== undefined)
    throw new Error(
      "Device removal was not confirmed. Refresh devices before retrying.",
    );
}
export async function inspectPush(
  userId: string,
  port: PushPort,
  transport: Transport = api,
): Promise<PushStatus> {
  if (!port.supported) return "Unsupported";
  const saved = binding(port),
    reg = await port.registration(),
    sub = await reg?.pushManager.getSubscription();
  if (saved || sub) await currentUser(userId, transport);
  if (saved?.userId !== userId && (saved || sub)) {
    await localUnsubscribe(reg);
    port.storage.removeItem(storageKey);
    return port.permission() === "denied" ? "Blocked" : "Not enabled";
  }
  if (saved) {
    const owned = devicesSchema
      .parse(await transport("/push/subscriptions"))
      .data.some((d) => d.id === saved.id);
    if (
      owned &&
      sub &&
      port.permission() === "granted" &&
      saved.endpointHash === (await fingerprint(sub.endpoint))
    )
      return "Enabled";
    // A revoked/changed browser or remote binding never silently subscribes again.
    if (owned) await remove(saved.id, transport);
    await localUnsubscribe(reg);
    port.storage.removeItem(storageKey);
  }
  return port.permission() === "denied" ? "Blocked" : "Not enabled";
}
export async function enablePush(
  userId: string,
  label: string,
  port: PushPort,
  transport: Transport = api,
) {
  if (!port.supported)
    throw new Error(
      "Push is unavailable in this browser. Use the in-app inbox.",
    );
  if (port.permission() === "denied")
    throw new Error(
      "Notifications are blocked. Change this site's browser notification setting, then refresh.",
    );
  // Start the native prompt directly in the click handler, before network/worker awaits.
  const permission =
    port.permission() === "granted"
      ? "granted"
      : await port.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Notifications were not enabled. You can continue using the in-app inbox.",
    );
  await currentUser(userId, transport);
  await inspectPush(userId, port, transport);
  const publicKey = publicKeyBytes(
    z
      .object({ data: z.object({ publicKey: z.string() }) })
      .parse(await transport("/push/public-key")).data.publicKey,
  );
  const reg = await port.register();
  let sub = await reg.pushManager.getSubscription();
  if (
    sub &&
    (!sub.options.applicationServerKey ||
      new Uint8Array(sub.options.applicationServerKey).toString() !==
        publicKey.toString())
  ) {
    await disablePush(userId, port, transport);
    sub = null;
  }
  try {
    sub ??= await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey,
    });
    await currentUser(userId, transport);
    const json = sub.toJSON();
    const device = deviceSchema.parse(
      (
        await transport<{ data: unknown }>("/push/subscriptions", {
          method: "POST",
          body: {
            endpoint: sub.endpoint,
            keys: json.keys,
            ...(label.trim() ? { deviceLabel: label.trim() } : {}),
          },
        })
      ).data,
    );
    await currentUser(userId, transport);
    port.storage.setItem(
      storageKey,
      JSON.stringify({
        id: device.id,
        userId,
        endpointHash: await fingerprint(sub.endpoint),
      }),
    );
    return device;
  } catch (error) {
    // An unconfirmed registration must not leave a live browser endpoint behind.
    await localUnsubscribe(reg);
    throw error;
  }
}
export async function disablePush(
  userId: string,
  port: PushPort,
  transport: Transport = api,
) {
  const saved = binding(port);
  const reg = port.supported ? await port.registration() : undefined;
  if (saved || (await reg?.pushManager.getSubscription()))
    await currentUser(userId, transport);
  let failure: unknown;
  if (saved?.userId === userId)
    try {
      await remove(saved.id, transport);
    } catch (error) {
      failure = error;
    }
  await localUnsubscribe(reg);
  if (failure) throw failure; // Keep the ID so removal can be retried; the local endpoint is already stopped.
  port.storage.removeItem(storageKey);
}
export async function logoutWithPush(
  userId: string,
  port: PushPort,
  transport: Transport = api,
) {
  // Corrupt/blocked local storage must not prevent server sign-out. Unsubscribe first.
  let saved: z.infer<typeof bindingSchema> | null = null;
  try {
    saved = binding(port);
  } catch {}
  if (port.supported) await localUnsubscribe(await port.registration());
  const response = await transport("/auth/logout", {
    method: "POST",
    public: true,
    body: saved?.userId === userId ? { pushSubscriptionId: saved.id } : {},
  });
  if (response !== undefined)
    throw new Error("Sign-out was not confirmed. Refresh and try again.");
  try {
    port.storage.removeItem(storageKey);
  } catch {}
}
